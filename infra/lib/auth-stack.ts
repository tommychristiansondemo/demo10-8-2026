import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { AppConfig } from './config';

/**
 * Amazon Cognito user pool with Managed Login (OAuth 2.0 authorization code + PKCE).
 * Students self-register with just a username + password; a pre-sign-up trigger auto-confirms the account.
 */
export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly client: cognito.UserPoolClient;
  readonly domainUrl: string;

  constructor(scope: Construct, id: string, cfg: AppConfig, props?: StackProps) {
    super(scope, id, props);

    const preSignUp = new nodejs.NodejsFunction(this, 'PreSignUp', {
      functionName: `${cfg.appName}-signup-trigger`,
      entry: path.join(__dirname, '../../services/auth/src/preSignUp.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(5),
      logGroup: new logs.LogGroup(this, 'PreSignUpLogs', {
        logGroupName: `/aws/lambda/${cfg.appName}-signup-trigger`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // Class-friendly: plain username sign-in (no email collected) and the weakest password policy Cognito allows
    // (6 characters is Cognito's minimum; no character-class requirements).
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${cfg.appName}-drivers`,
      selfSignUpEnabled: true,
      signInAliases: { username: true },
      signInCaseSensitive: false,
      autoVerify: {},
      passwordPolicy: { minLength: 6, requireLowercase: false, requireUppercase: false, requireDigits: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.NONE,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      lambdaTriggers: { preSignUp },
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const callbackUrls = [...cfg.siteHostnames.map((h) => `https://${h}/`), 'http://localhost:5173/'];
    this.client = this.userPool.addClient('WebClient', {
      userPoolClientName: `${cfg.appName}-web`,
      generateSecret: false,
      authFlows: { userSrp: true, adminUserPassword: true }, // admin flow = IAM-only, used by scripts/smoke_test.py
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls: callbackUrls,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    const domain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `${cfg.appName}-drivers-${this.account}` },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    new cognito.CfnManagedLoginBranding(this, 'Branding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.client.userPoolClientId,
      useCognitoProvidedValues: true,
    });
    this.domainUrl = domain.baseUrl();

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.client.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: this.domainUrl });
  }
}
