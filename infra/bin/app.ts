#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { AiStack } from '../lib/ai-stack';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { loadConfig } from '../lib/config';
import { DataStack } from '../lib/data-stack';
import { InsightsStack } from '../lib/insights-stack';
import { ModelConfigStack } from '../lib/model-config-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { WebStack } from '../lib/web-stack';

const app = new App();
const cfg = loadConfig(app);
// Everything in us-east-1: CloudFront certificates and CLOUDFRONT-scope WAF must live there anyway.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

const data = new DataStack(app, 'OwnerAssist-Data', cfg, { env, description: 'Owner Assist - KMS, DynamoDB, knowledge source bucket' });
const ai = new AiStack(app, 'OwnerAssist-AI', cfg, { env, kbBucket: data.kbBucket, key: data.key, description: 'Owner Assist - S3 Vectors, Bedrock Knowledge Base, Guardrail' });
const auth = new AuthStack(app, 'OwnerAssist-Identity', cfg, { env, description: 'Owner Assist - Cognito user pool (username sign-in) + managed login' });
const modelConfig = new ModelConfigStack(app, 'OwnerAssist-ModelConfig', cfg, {
  env, description: 'Owner Assist - AppConfig model-selection document + LLM evaluation Lambda', table: data.table,
});
const api = new ApiStack(app, 'OwnerAssist-Api', cfg, {
  env, description: 'Owner Assist - chat agent and REST API Lambdas',
  table: data.table, userPool: auth.userPool, client: auth.client,
  knowledgeBaseArn: ai.knowledgeBaseArn, knowledgeBaseId: ai.knowledgeBaseId,
  guardrailArn: ai.guardrailArn, guardrailId: ai.guardrailId, guardrailVersion: ai.guardrailVersion,
  modelConfig,
});
const web = new WebStack(app, 'OwnerAssist-Web', cfg, {
  env, description: 'Owner Assist - CloudFront, WAF, ACM, Route 53, S3 site',
  chatUrl: api.chatUrl, apiUrl: api.apiUrl,
  userPoolId: auth.userPool.userPoolId, userPoolClientId: auth.client.userPoolClientId, cognitoDomainUrl: auth.domainUrl,
});
new ObservabilityStack(app, 'OwnerAssist-Observability', cfg, {
  env, description: 'Owner Assist - dashboard and alarms',
  chatFn: api.chatFn, apiFn: api.apiFn, distributionId: web.distribution.distributionId, webAclName: web.webAclName, modelId: cfg.chatModelId,
});

new InsightsStack(app, 'OwnerAssist-Insights', cfg, {
  env, description: 'Owner Assist - Class Insights app (static S3 site + Lambda chatbot/API + projectknowledge.md)',
  userPool: auth.userPool, cognitoDomainUrl: auth.domainUrl, webAclArn: web.webAclArn,
  knowledgeBaseId: ai.knowledgeBaseId, knowledgeBaseArn: ai.knowledgeBaseArn, dataSourceId: ai.dataSourceId,
  guardrailId: ai.guardrailId, guardrailArn: ai.guardrailArn, guardrailVersion: ai.guardrailVersion,
  modelConfig,
});

Tags.of(app).add('app', 'owner-assist');
Tags.of(app).add('purpose', 'aws-class-demo');
