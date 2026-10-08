import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfig } from './config';

interface InsightsProps extends StackProps {
  userPool: cognito.IUserPool;
  cognitoDomainUrl: string;
  webAclArn: string;
  knowledgeBaseId: string;
  knowledgeBaseArn: string;
  dataSourceId: string;
  guardrailId: string;
  guardrailArn: string;
  guardrailVersion: string;
  modelConfig: { appId: string; envId: string; profileId: string };
}

/**
 * Class Insights: a separate application that explains the Owner Assist deployment.
 * Static UI in S3 (CloudFront OAC), dynamic content from two Lambdas, projectknowledge.md in a private S3 bucket,
 * read-only IAM scoped to an explicit allow-list of log groups / stacks / Bedrock resources.
 */
export class InsightsStack extends Stack {
  constructor(scope: Construct, id: string, cfg: AppConfig, props: InsightsProps) {
    super(scope, id, props);
    const host = cfg.insightsHostname;

    // ---- knowledge document ----
    const knowledge = new s3.Bucket(this, 'KnowledgeBucket', {
      bucketName: `${cfg.appName}-insights-knowledge-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      versioned: true, removalPolicy: RemovalPolicy.DESTROY, autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, 'DeployKnowledge', {
      destinationBucket: knowledge,
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../docs/knowledge'))],
      prune: false,
    });

    // ---- auth: second app client on the same user pool (students reuse their Owner Assist login) ----
    const client = new cognito.UserPoolClient(this, 'InsightsClient', {
      userPool: props.userPool,
      userPoolClientName: `${cfg.appName}-insights-web`,
      generateSecret: false,
      authFlows: { userSrp: true, adminUserPassword: true }, // admin flow = IAM-only, used by scripts/insights_smoke.py
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [`https://${host}/`, 'http://localhost:5174/'],
        logoutUrls: [`https://${host}/`, 'http://localhost:5174/'],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: Duration.hours(1), idTokenValidity: Duration.hours(1), refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });
    new cognito.CfnManagedLoginBranding(this, 'InsightsBranding', {
      userPoolId: props.userPool.userPoolId, clientId: client.userPoolClientId, useCognitoProvidedValues: true,
    });

    // ---- Lambdas ----
    const logGroup = (name: string) => new logs.LogGroup(this, `${name}Logs`, {
      logGroupName: `/aws/lambda/${cfg.appName}-${name}`, retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY,
    });
    const common = {
      runtime: lambda.Runtime.NODEJS_22_X, architecture: lambda.Architecture.ARM_64, tracing: lambda.Tracing.ACTIVE,
      loggingFormat: lambda.LoggingFormat.JSON,
      bundling: { format: nodejs.OutputFormat.ESM, target: 'node22', minify: true, sourceMap: true,
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);" },
      environment: {
        USER_POOL_ID: props.userPool.userPoolId, USER_POOL_CLIENT_ID: client.userPoolClientId, KNOWLEDGE_BUCKET: knowledge.bucketName,
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId, DATA_SOURCE_ID: props.dataSourceId,
        GUARDRAIL_ID: props.guardrailId, GUARDRAIL_VERSION: props.guardrailVersion,
        MODEL_ID: cfg.chatModelId, NODE_OPTIONS: '--enable-source-maps',
        APPCONFIG_APP_ID: props.modelConfig.appId, APPCONFIG_ENV_ID: props.modelConfig.envId, APPCONFIG_PROFILE_ID: props.modelConfig.profileId,
      },
    };
    const chatFn = new nodejs.NodejsFunction(this, 'InsightsChat', {
      ...common, functionName: `${cfg.appName}-insights-chat`, description: 'Class Insights chatbot (Bedrock + projectknowledge.md + live AWS data)',
      entry: path.join(__dirname, '../../services/insights/src/chat.ts'), memorySize: 1024, timeout: Duration.minutes(3), logGroup: logGroup('insights-chat'),
    });
    const apiFn = new nodejs.NodejsFunction(this, 'InsightsApi', {
      ...common, functionName: `${cfg.appName}-insights-api`, description: 'Class Insights dashboard API (read-only)',
      entry: path.join(__dirname, '../../services/insights/src/api.ts'), memorySize: 512, timeout: Duration.seconds(30), logGroup: logGroup('insights-api'),
    });

    // Least-privilege, read-only access shared by both functions.
    const groups = ['/aws/lambda/owner-assist-chat', '/aws/lambda/owner-assist-api', '/aws/lambda/owner-assist-signup-trigger',
      '/aws/lambda/owner-assist-insights-chat', '/aws/lambda/owner-assist-insights-api', '/aws/lambda/owner-assist-model-selection', 'aws-waf-logs-owner-assist']
      .map((g) => `arn:aws:logs:${this.region}:${this.account}:log-group:${g}`);
    const readOnly = [
      new iam.PolicyStatement({ sid: 'ReadAllowListedLogs', actions: ['logs:FilterLogEvents', 'logs:StartQuery'], resources: [...groups, ...groups.map((g) => `${g}:*`)] }),
      new iam.PolicyStatement({ sid: 'LogsInsightsResults', actions: ['logs:GetQueryResults'], resources: ['*'] }),
      new iam.PolicyStatement({ sid: 'Metrics', actions: ['cloudwatch:GetMetricData'], resources: ['*'] }),
      new iam.PolicyStatement({ sid: 'StackStatus', actions: ['cloudformation:DescribeStacks', 'cloudformation:ListStackResources'],
        resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/OwnerAssist-*/*`] }),
      new iam.PolicyStatement({ sid: 'BedrockConfig', actions: ['bedrock:GetKnowledgeBase', 'bedrock:GetDataSource', 'bedrock:ListIngestionJobs'], resources: [props.knowledgeBaseArn] }),
      new iam.PolicyStatement({ sid: 'GuardrailConfig', actions: ['bedrock:GetGuardrail'], resources: [props.guardrailArn, `${props.guardrailArn}:*`] }),
      new iam.PolicyStatement({ sid: 'LlmSelectionReadOnly',
        actions: ['appconfig:ListHostedConfigurationVersions', 'appconfig:GetHostedConfigurationVersion', 'appconfig:ListDeployments'],
        resources: [`arn:aws:appconfig:${this.region}:${this.account}:application/${props.modelConfig.appId}`,
          `arn:aws:appconfig:${this.region}:${this.account}:application/${props.modelConfig.appId}/*`] }),
      new iam.PolicyStatement({ sid: 'LambdaConfig', actions: ['lambda:GetFunctionConfiguration'],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:${cfg.appName}-*`] }),
    ];
    for (const fn of [chatFn, apiFn]) {
      readOnly.forEach((st) => fn.addToRolePolicy(st));
      knowledge.grantRead(fn);
    }
    chatFn.addToRolePolicy(new iam.PolicyStatement({
      sid: 'InvokeModel', actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [`arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${cfg.chatModelId}`,
        `arn:aws:bedrock:*::foundation-model/${cfg.chatModelId.replace(/^(us|global)\./, '')}*`],
    }));
    const chatUrl = chatFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM, invokeMode: lambda.InvokeMode.RESPONSE_STREAM });
    const apiUrl = apiFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM });

    // ---- static site + edge ----
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', { hostedZoneId: cfg.hostedZoneId, zoneName: cfg.domainName });
    const cert = new acm.Certificate(this, 'Certificate', { domainName: host, validation: acm.CertificateValidation.fromDns(zone) });
    const site = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `${cfg.appName}-insights-site-${this.account}`, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, removalPolicy: RemovalPolicy.DESTROY, autoDeleteObjects: true,
    });
    const cognitoHost = Fn.select(2, Fn.split('/', props.cognitoDomainUrl));
    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `${cfg.appName}-insights-security-headers`,
      securityHeadersBehavior: {
        contentSecurityPolicy: { override: true, contentSecurityPolicy: [
          "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", `connect-src 'self' https://${cognitoHost}`,
          "frame-ancestors 'none'", "base-uri 'self'", `form-action 'self' https://${cognitoHost}`].join('; ') },
        strictTransportSecurity: { override: true, accessControlMaxAge: Duration.days(365), includeSubdomains: false },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: cloudfront.HeadersFrameOption.DENY },
        referrerPolicy: { override: true, referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN },
      },
    });
    const spa = new cloudfront.Function(this, 'SpaRewrite', {
      functionName: `${cfg.appName}-insights-spa-rewrite`, runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline("function handler(event){var r=event.request;if(!r.uri.includes('.')){r.uri='/index.html';}return r;}"),
    });
    const api = (u: lambda.IFunctionUrl): cloudfront.BehaviorOptions => ({
      origin: origins.FunctionUrlOrigin.withOriginAccessControl(u, { readTimeout: Duration.seconds(60), keepaliveTimeout: Duration.seconds(60) }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY, allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: headers, compress: false,
    });
    const dist = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Owner Assist - Class Insights', domainNames: [host], certificate: cert, webAclId: props.webAclArn,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021, httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, responseHeadersPolicy: headers,
        functionAssociations: [{ function: spa, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: { '/api/chat': api(chatUrl), '/api/*': api(apiUrl) },
    });
    [chatUrl, apiUrl].forEach((u, i) => new lambda.CfnPermission(this, `InvokeViaUrl${i}`, {
      action: 'lambda:InvokeFunction', functionName: u.functionArn, principal: 'cloudfront.amazonaws.com',
      sourceArn: dist.distributionArn, invokedViaFunctionUrl: true,
    }));
    const recordName = host.replace(`.${cfg.domainName}`, '');
    new route53.ARecord(this, 'Alias', { zone, recordName, target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dist)) });
    new route53.AaaaRecord(this, 'AliasV6', { zone, recordName, target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dist)) });

    const distDir = path.join(__dirname, '../../insights-web/dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('insights-web/dist missing - run `npm run build -w insights-web`.');
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: site,
      sources: [s3deploy.Source.asset(distDir), s3deploy.Source.jsonData('config.json', {
        region: this.region, userPoolId: props.userPool.userPoolId, userPoolClientId: client.userPoolClientId,
        cognitoDomain: props.cognitoDomainUrl, ownerAssistUrl: `https://${cfg.siteHostnames[0]}`,
      })],
      distribution: dist, distributionPaths: ['/index.html', '/config.json'], memoryLimit: 512,
    });

    new CfnOutput(this, 'InsightsUrl', { value: `https://${host}` });
    new CfnOutput(this, 'KnowledgeBucketName', { value: knowledge.bucketName });
    new CfnOutput(this, 'InsightsDistributionId', { value: dist.distributionId });
  }
}
