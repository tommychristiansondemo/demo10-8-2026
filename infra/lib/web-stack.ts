import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfig } from './config';

interface WebStackProps extends StackProps {
  chatUrl: lambda.IFunctionUrl;
  apiUrl: lambda.IFunctionUrl;
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomainUrl: string;
}

/** Edge tier: Route 53 + ACM + WAF + CloudFront in front of a private S3 SPA and the two Lambda Function URLs. */
export class WebStack extends Stack {
  readonly distribution: cloudfront.Distribution;
  readonly webAclName: string;
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, cfg: AppConfig, props: WebStackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', { hostedZoneId: cfg.hostedZoneId, zoneName: cfg.domainName });
    const cert = new acm.Certificate(this, 'Certificate', {
      domainName: cfg.siteHostnames[0],
      subjectAlternativeNames: cfg.siteHostnames.slice(1),
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ---- WAF (CloudFront scope must live in us-east-1) ----
    this.webAclName = `${cfg.appName}-edge`;
    const managed = (name: string, priority: number, excluded: string[] = []): wafv2.CfnWebACL.RuleProperty => ({
      name, priority, overrideAction: { none: {} },
      statement: { managedRuleGroupStatement: { vendorName: 'AWS', name, ruleActionOverrides: excluded.map((n) => ({ name: n, actionToUse: { count: {} } })) } },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: name, sampledRequestsEnabled: true },
    });
    const acl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: this.webAclName,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'owner-assist-edge', sampledRequestsEnabled: true },
      rules: [
        managed('AWSManagedRulesAmazonIpReputationList', 0),
        managed('AWSManagedRulesCommonRuleSet', 1, ['SizeRestrictions_BODY']),
        managed('AWSManagedRulesKnownBadInputsRuleSet', 2),
        {
          name: 'ChatRateLimit', priority: 10, action: { block: { customResponse: { responseCode: 429 } } },
          statement: { rateBasedStatement: { limit: 60, evaluationWindowSec: 300, aggregateKeyType: 'IP',
            scopeDownStatement: { byteMatchStatement: { fieldToMatch: { uriPath: {} }, positionalConstraint: 'STARTS_WITH', searchString: '/api/chat', textTransformations: [{ priority: 0, type: 'NONE' }] } } } },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'ChatRateLimit', sampledRequestsEnabled: true },
        },
        {
          name: 'GlobalRateLimit', priority: 11, action: { block: {} },
          statement: { rateBasedStatement: { limit: 2000, evaluationWindowSec: 300, aggregateKeyType: 'IP' } },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'GlobalRateLimit', sampledRequestsEnabled: true },
        },
      ],
    });
    const wafLogs = new logs.LogGroup(this, 'WafLogs', {
      logGroupName: `aws-waf-logs-${cfg.appName}`, retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY,
    });
    this.webAclArn = acl.attrArn;
    new wafv2.CfnLoggingConfiguration(this, 'WafLogging', { resourceArn: acl.attrArn, logDestinationConfigs: [wafLogs.logGroupArn] });

    // ---- Static site ----
    const site = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `${cfg.appName}-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      functionName: `${cfg.appName}-spa-rewrite`,
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event){var r=event.request;if(!r.uri.includes('.')){r.uri='/index.html';}return r;}"),
    });

    const cognitoHost = Fn.select(2, Fn.split('/', props.cognitoDomainUrl)); // https://<host> -> <host> (token-safe)
    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `${cfg.appName}-security-headers`,
      securityHeadersBehavior: {
        contentSecurityPolicy: { override: true, contentSecurityPolicy: [
          "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:",
          `connect-src 'self' https://${cognitoHost}`, "frame-ancestors 'none'", "base-uri 'self'", `form-action 'self' https://${cognitoHost}`,
        ].join('; ') },
        strictTransportSecurity: { override: true, accessControlMaxAge: Duration.days(365), includeSubdomains: false },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: cloudfront.HeadersFrameOption.DENY },
        referrerPolicy: { override: true, referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN },
      },
    });

    const apiBehavior = (url: lambda.IFunctionUrl): cloudfront.BehaviorOptions => ({
      origin: origins.FunctionUrlOrigin.withOriginAccessControl(url, { readTimeout: Duration.seconds(60), keepaliveTimeout: Duration.seconds(60) }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: headers,
      compress: false,
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Owner Assist (class demo)',
      domainNames: cfg.siteHostnames,
      certificate: cert,
      webAclId: acl.attrArn,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/chat': apiBehavior(props.chatUrl),
        '/api/*': apiBehavior(props.apiUrl),
      },
    });

    // CDK grants lambda:InvokeFunctionUrl for OAC; Lambda (since Oct 2025) also requires lambda:InvokeFunction
    // scoped to function-URL invocations.
    [props.chatUrl, props.apiUrl].forEach((u, i) => new lambda.CfnPermission(this, `InvokeViaUrl${i}`, {
      action: 'lambda:InvokeFunction',
      functionName: u.functionArn,
      principal: 'cloudfront.amazonaws.com',
      sourceArn: this.distribution.distributionArn,
      invokedViaFunctionUrl: true,
    }));

    for (const host of cfg.siteHostnames) {
      const recordName = host.replace(`.${cfg.domainName}`, '');
      new route53.ARecord(this, `Alias-${recordName}`, { zone, recordName, target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)) });
      new route53.AaaaRecord(this, `AliasV6-${recordName}`, { zone, recordName, target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)) });
    }

    const dist = path.join(__dirname, '../../web/dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('web/dist is missing - run `npm run build -w web` first (scripts/deploy.sh does this).');
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: site,
      sources: [
        s3deploy.Source.asset(dist),
        s3deploy.Source.jsonData('config.json', {
          region: this.region,
          userPoolId: props.userPoolId,
          userPoolClientId: props.userPoolClientId,
          cognitoDomain: props.cognitoDomainUrl,
          insightsUrl: `https://${cfg.insightsHostname}`,
        }),
      ],
      distribution: this.distribution,
      distributionPaths: ['/index.html', '/config.json'],
      memoryLimit: 512,
    });

    new CfnOutput(this, 'SiteUrl', { value: `https://${cfg.siteHostnames[0]}` });
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
  }
}
