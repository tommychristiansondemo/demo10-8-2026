/** Shared clients, auth, redaction and the log-source allow-list for the Class Insights Lambdas. */
import { BedrockClient } from '@aws-sdk/client-bedrock';
import { BedrockAgentClient } from '@aws-sdk/client-bedrock-agent';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { AppConfigClient } from '@aws-sdk/client-appconfig';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

export const logger = new Logger({ serviceName: 'owner-assist-insights' });
export const metrics = new Metrics({ namespace: 'OwnerAssist', serviceName: 'insights' });
export const tracer = new Tracer({ serviceName: 'owner-assist-insights' });

export const bedrockRuntime = tracer.captureAWSv3Client(new BedrockRuntimeClient({ maxAttempts: 4 }));
export const bedrock = tracer.captureAWSv3Client(new BedrockClient({}));
export const bedrockAgent = tracer.captureAWSv3Client(new BedrockAgentClient({}));
export const cfn = tracer.captureAWSv3Client(new CloudFormationClient({}));
export const cw = tracer.captureAWSv3Client(new CloudWatchClient({}));
export const cwl = tracer.captureAWSv3Client(new CloudWatchLogsClient({}));
export const lambda = tracer.captureAWSv3Client(new LambdaClient({}));
export const appconfig = tracer.captureAWSv3Client(new AppConfigClient({}));
const s3 = tracer.captureAWSv3Client(new S3Client({}));

/**
 * Only these log groups can ever be read (also enforced by IAM - the Lambda role is scoped to exactly these ARNs).
 * Keys are the friendly names the chatbot and UI use.
 */
export const LOG_SOURCES: Record<string, { group: string; description: string }> = {
  'owner-assist-chat': { group: '/aws/lambda/owner-assist-chat', description: 'Owner Assist chatbot: llm_call reasoning logs, tool calls, chat complete summaries, errors' },
  'owner-assist-api': { group: '/aws/lambda/owner-assist-api', description: 'Owner Assist REST API: garage, conversations, feedback (thumbs up/down)' },
  'signup-trigger': { group: '/aws/lambda/owner-assist-signup-trigger', description: 'Cognito pre-sign-up trigger (auto-confirm)' },
  'insights-chat': { group: '/aws/lambda/owner-assist-insights-chat', description: 'This Class Insights chatbot: its own llm_call reasoning logs and tool calls' },
  'insights-api': { group: '/aws/lambda/owner-assist-insights-api', description: 'Class Insights dashboard API' },
  'model-selection': { group: '/aws/lambda/owner-assist-model-selection', description: 'LLM Selection evaluations: per-model probe results, ranking, switch decisions (log_type = "model_selection")' },
  waf: { group: 'aws-waf-logs-owner-assist', description: 'AWS WAF request logs for www.awsteach.com (allowed/blocked, rule matched, client country)' },
};

export const STACKS = ['OwnerAssist-Data', 'OwnerAssist-AI', 'OwnerAssist-Identity', 'OwnerAssist-ModelConfig', 'OwnerAssist-Api', 'OwnerAssist-Web',
  'OwnerAssist-Observability', 'OwnerAssist-Insights', 'OwnerAssist-CDKToolkit'];

/** Remove anything that looks like a credential before data leaves the Lambda. */
export function redact<T>(value: T): T {
  const s = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  if (s === undefined) return value;
  const out = s
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[REDACTED_JWT]')
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_AWS_KEY]')
    .replace(/(\\?"(?:secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-auth-token|authorization|x-amz-security-token|aws_secret_access_key)\\?"\s*:\s*\\?")[^"\\]+/gi, '$1[REDACTED]')
    .replace(/\b(password|secret|api[_-]?key)=([^&\s"]+)/gi, '$1=[REDACTED]');
  return JSON.parse(out);
}

const verifier = CognitoJwtVerifier.create({ userPoolId: process.env.USER_POOL_ID!, clientId: process.env.USER_POOL_CLIENT_ID!, tokenUse: 'access' });
export async function authenticate(headers: Record<string, string | undefined>) {
  try {
    const p = await verifier.verify(headers['x-auth-token'] || '');
    return { sub: p.sub, username: String(p.username ?? p.sub) };
  } catch {
    return null;
  }
}

let knowledgeCache: { at: number; text: string } | null = null;
/** projectknowledge.md lives in a private S3 bucket; re-read at most once a minute so updates appear quickly. */
export async function projectKnowledge(): Promise<string> {
  if (knowledgeCache && Date.now() - knowledgeCache.at < 60_000) return knowledgeCache.text;
  const r = await s3.send(new GetObjectCommand({ Bucket: process.env.KNOWLEDGE_BUCKET!, Key: 'projectknowledge.md' }));
  const text = await r.Body!.transformToString();
  knowledgeCache = { at: Date.now(), text };
  return text;
}

export const lowerHeaders = (h: Record<string, string | undefined> | undefined) =>
  Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]));
