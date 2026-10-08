import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as appconfig from 'aws-cdk-lib/aws-appconfig';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { CANDIDATES, DEFAULT_CONFIG } from '../../services/shared/modelSelection';
import { AppConfig } from './config';

/** IAM resources needed to invoke every candidate model (cross-region inference profiles route to any US region). */
export function candidateModelArns(stack: Stack): string[] {
  return CANDIDATES.flatMap((c) => {
    const base = c.modelId.replace(/^(us|global)\./, '');
    return c.modelId === base
      ? [`arn:aws:bedrock:${stack.region}::foundation-model/${base}`]
      : [`arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/${c.modelId}`, `arn:aws:bedrock:*::foundation-model/${base}`];
  });
}

interface ModelConfigProps extends StackProps { table: dynamodb.ITableV2 }

/**
 * LLM Selection: AWS AppConfig holds the live model-selection document (weights, 5-model catalog, active model,
 * last evaluation). The owner-assist-model-selection Lambda evaluates the candidates and deploys new versions.
 */
export class ModelConfigStack extends Stack {
  readonly appId: string;
  readonly envId: string;
  readonly profileId: string;
  readonly profileArn: string;
  readonly selectionFn: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, cfg: AppConfig, props: ModelConfigProps) {
    super(scope, id, props);

    const app = new appconfig.CfnApplication(this, 'App', { name: cfg.appName, description: 'Owner Assist runtime configuration' });
    const env = new appconfig.CfnEnvironment(this, 'Live', { applicationId: app.ref, name: 'live', description: 'Production environment used by the live app' });
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['schemaVersion', 'weights', 'activeModel', 'switchMargin', 'candidates'],
      properties: {
        schemaVersion: { const: 1 },
        weights: { type: 'object', required: ['quality', 'cost', 'latency'], additionalProperties: false,
          properties: Object.fromEntries(['quality', 'cost', 'latency'].map((k) => [k, { type: 'integer', minimum: 0, maximum: 100 }])) },
        activeModel: { enum: CANDIDATES.map((c) => c.key) },
        switchMargin: { type: 'number', minimum: 0, maximum: 1 },
        candidates: { type: 'array', minItems: 1, items: { type: 'object', required: ['key', 'modelId', 'priceInPerM', 'priceOutPerM', 'qualityPrior', 'profile'] } },
        lastEvaluation: { type: 'object' },
      },
    };
    const profile = new appconfig.CfnConfigurationProfile(this, 'ModelSelection', {
      applicationId: app.ref, name: 'model-selection', locationUri: 'hosted', type: 'AWS.Freeform',
      description: 'Weights (quality/cost/latency), candidate LLM catalog, active model, last evaluation',
      validators: [{ type: 'JSON_SCHEMA', content: JSON.stringify(schema) }],
    });
    const strategy = new appconfig.CfnDeploymentStrategy(this, 'Immediate', {
      name: `${cfg.appName}-immediate`, description: 'All at once, no bake time (class demo: changes visible within ~15 s)',
      deploymentDurationInMinutes: 0, finalBakeTimeInMinutes: 0, growthFactor: 100, growthType: 'LINEAR', replicateTo: 'NONE',
    });
    const initial = new appconfig.CfnHostedConfigurationVersion(this, 'InitialVersion', {
      applicationId: app.ref, configurationProfileId: profile.ref, contentType: 'application/json',
      content: JSON.stringify(DEFAULT_CONFIG), description: 'Initial: weights 50/25/25, Claude Sonnet 4.6 active',
    });
    initial.applyRemovalPolicy(RemovalPolicy.RETAIN); // never let a CDK update roll the live document back to defaults
    new appconfig.CfnDeployment(this, 'InitialDeployment', {
      applicationId: app.ref, environmentId: env.ref, configurationProfileId: profile.ref,
      configurationVersion: initial.ref, deploymentStrategyId: strategy.ref, description: 'Initial deployment by CDK',
    });

    this.appId = app.ref;
    this.envId = env.ref;
    this.profileId = profile.ref;
    this.profileArn = `arn:aws:appconfig:${this.region}:${this.account}:application/${app.ref}/environment/${env.ref}/configuration/${profile.ref}`;

    this.selectionFn = new nodejs.NodejsFunction(this, 'SelectionFunction', {
      functionName: `${cfg.appName}-model-selection`,
      description: 'Evaluates 5 candidate LLMs with live probes and switches the live model via AppConfig',
      entry: path.join(__dirname, '../../services/modelsel/src/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X, architecture: lambda.Architecture.ARM_64, tracing: lambda.Tracing.ACTIVE,
      loggingFormat: lambda.LoggingFormat.JSON, memorySize: 1024, timeout: Duration.minutes(5),
      retryAttempts: 0, // a failed evaluation should not silently re-run with the same student's weights
      bundling: { format: nodejs.OutputFormat.ESM, target: 'node22', minify: true, sourceMap: true,
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);" },
      environment: {
        TABLE_NAME: props.table.tableName, APPCONFIG_APP_ID: app.ref, APPCONFIG_ENV_ID: env.ref,
        APPCONFIG_PROFILE_ID: profile.ref, APPCONFIG_STRATEGY_ID: strategy.ref, NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'SelectionLogs', {
        logGroupName: `/aws/lambda/${cfg.appName}-model-selection`, retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    props.table.grantReadWriteData(this.selectionFn);
    this.selectionFn.addToRolePolicy(new iam.PolicyStatement({ sid: 'InvokeCandidates', actions: ['bedrock:InvokeModel'], resources: candidateModelArns(this) }));
    this.selectionFn.addToRolePolicy(new iam.PolicyStatement({ sid: 'ReadLiveConfig',
      actions: ['appconfig:StartConfigurationSession', 'appconfig:GetLatestConfiguration'], resources: [this.profileArn] }));
    this.selectionFn.addToRolePolicy(new iam.PolicyStatement({ sid: 'PublishConfig',
      actions: ['appconfig:CreateHostedConfigurationVersion', 'appconfig:ListHostedConfigurationVersions', 'appconfig:StartDeployment', 'appconfig:GetDeployment'],
      resources: [
        `arn:aws:appconfig:${this.region}:${this.account}:application/${app.ref}`, // ListHostedConfigurationVersions authorizes on the application
        `arn:aws:appconfig:${this.region}:${this.account}:application/${app.ref}/configurationprofile/${profile.ref}`,
        `arn:aws:appconfig:${this.region}:${this.account}:application/${app.ref}/configurationprofile/${profile.ref}/*`,
        `arn:aws:appconfig:${this.region}:${this.account}:application/${app.ref}/environment/${env.ref}`,
        `arn:aws:appconfig:${this.region}:${this.account}:application/${app.ref}/environment/${env.ref}/deployment/*`,
        `arn:aws:appconfig:${this.region}:${this.account}:deploymentstrategy/${strategy.ref}`,
      ] }));

    new CfnOutput(this, 'AppConfigApplicationId', { value: app.ref });
    new CfnOutput(this, 'AppConfigEnvironmentId', { value: env.ref });
    new CfnOutput(this, 'AppConfigProfileId', { value: profile.ref });
    new CfnOutput(this, 'SelectionFunctionName', { value: this.selectionFn.functionName });
  }
}
