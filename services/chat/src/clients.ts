import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

export const logger = new Logger({ serviceName: 'owner-assist-chat' });
export const metrics = new Metrics({ namespace: 'OwnerAssist', serviceName: 'chat' });
export const tracer = new Tracer({ serviceName: 'owner-assist-chat' });

export const bedrock = tracer.captureAWSv3Client(new BedrockRuntimeClient({ maxAttempts: 4 }));
export const agentRuntime = tracer.captureAWSv3Client(new BedrockAgentRuntimeClient({ maxAttempts: 4 }));
export const ddb = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})), {
  marshallOptions: { removeUndefinedValues: true },
});
export const TABLE = process.env.TABLE_NAME!;
