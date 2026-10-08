import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { AppConfig } from './config';
import { candidateModelArns } from './model-config-stack';

interface ApiStackProps extends StackProps {
  table: dynamodb.ITableV2;
  userPool: cognito.IUserPool;
  client: cognito.IUserPoolClient;
  knowledgeBaseArn: string;
  knowledgeBaseId: string;
  guardrailArn: string;
  guardrailId: string;
  guardrailVersion: string;
  modelConfig: { appId: string; envId: string; profileId: string; profileArn: string; selectionFn: lambda.IFunction };
}

/**
 * Compute tier. Both functions are exposed ONLY through CloudFront: Function URLs use AWS_IAM auth and CloudFront
 * signs requests with Origin Access Control. End users are identified by their Cognito access token.
 */
export class ApiStack extends Stack {
  readonly chatFn: nodejs.NodejsFunction;
  readonly apiFn: nodejs.NodejsFunction;
  readonly chatUrl: lambda.FunctionUrl;
  readonly apiUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, cfg: AppConfig, props: ApiStackProps) {
    super(scope, id, props);

    const common = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      loggingFormat: lambda.LoggingFormat.JSON,
      bundling: { format: nodejs.OutputFormat.ESM, target: 'node22', minify: true, sourceMap: true,
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);" },
      environment: {
        TABLE_NAME: props.table.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.client.userPoolClientId,
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_LOG_LEVEL: 'INFO',
        APPCONFIG_APP_ID: props.modelConfig.appId,
        APPCONFIG_ENV_ID: props.modelConfig.envId,
        APPCONFIG_PROFILE_ID: props.modelConfig.profileId,
      },
    };
    const logGroup = (name: string) => new logs.LogGroup(this, `${name}Logs`, {
      logGroupName: `/aws/lambda/${cfg.appName}-${name}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.chatFn = new nodejs.NodejsFunction(this, 'ChatFunction', {
      ...common,
      functionName: `${cfg.appName}-chat`,
      description: 'Owner Assist streaming agent (Bedrock Converse + tools + KB + Guardrail)',
      entry: path.join(__dirname, '../../services/chat/src/index.ts'),
      memorySize: 1024,
      timeout: Duration.minutes(3),
      logGroup: logGroup('chat'),
      environment: {
        ...common.environment,
        MODEL_ID: cfg.chatModelId,
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        GUARDRAIL_ID: props.guardrailId,
        GUARDRAIL_VERSION: props.guardrailVersion,
      },
    });
    props.table.grantReadWriteData(this.chatFn);
    // The live model is chosen at runtime from AppConfig, so the role may invoke any of the 5 candidates (and only those).
    // Cross-region inference profiles route to the foundation model in any US region -> region-wildcarded FM ARNs.
    this.chatFn.addToRolePolicy(new iam.PolicyStatement({
      sid: 'InvokeCandidateModels',
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: candidateModelArns(this),
    }));
    this.chatFn.addToRolePolicy(new iam.PolicyStatement({ sid: 'Retrieve', actions: ['bedrock:Retrieve'], resources: [props.knowledgeBaseArn] }));
    this.chatFn.addToRolePolicy(new iam.PolicyStatement({ sid: 'Guardrail', actions: ['bedrock:ApplyGuardrail'], resources: [props.guardrailArn] }));
    this.chatUrl = this.chatFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM, invokeMode: lambda.InvokeMode.RESPONSE_STREAM });

    this.apiFn = new nodejs.NodejsFunction(this, 'ApiFunction', {
      ...common,
      functionName: `${cfg.appName}-api`,
      description: 'Owner Assist REST API (garage, conversations, feedback)',
      entry: path.join(__dirname, '../../services/api/src/index.ts'),
      memorySize: 512,
      timeout: Duration.seconds(15),
      logGroup: logGroup('api'),
    });
    props.table.grantReadWriteData(this.apiFn);
    this.apiFn.addEnvironment('MODEL_SELECTION_FN', props.modelConfig.selectionFn.functionName);
    props.modelConfig.selectionFn.grantInvoke(this.apiFn);
    const readConfig = new iam.PolicyStatement({ sid: 'ReadLiveModelConfig',
      actions: ['appconfig:StartConfigurationSession', 'appconfig:GetLatestConfiguration'], resources: [props.modelConfig.profileArn] });
    this.chatFn.addToRolePolicy(readConfig);
    this.apiFn.addToRolePolicy(readConfig);
    this.apiUrl = this.apiFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM });
  }
}
