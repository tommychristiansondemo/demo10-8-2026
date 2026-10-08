import { createHash } from 'node:crypto';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3vectors from 'aws-cdk-lib/aws-s3vectors';
import { Construct } from 'constructs';
import { AppConfig } from './config';

interface AiStackProps extends StackProps {
  kbBucket: s3.IBucket;
  key: kms.IKey;
}

/**
 * Generative AI resources:
 *  - Amazon S3 Vectors bucket + index (serverless vector store, no idle cost)
 *  - Bedrock Knowledge Base over the curated corpus, with metadata (model/year/doc_type) for filtered retrieval
 *  - Bedrock Guardrail (content filters, prompt-attack filter, denied topics, sensitive-data blocking)
 */
export class AiStack extends Stack {
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseArn: string;
  readonly dataSourceId: string;
  readonly guardrailId: string;
  readonly guardrailArn: string;
  readonly guardrailVersion: string;

  constructor(scope: Construct, id: string, cfg: AppConfig, props: AiStackProps) {
    super(scope, id, props);

    const vectorBucketName = `${cfg.appName}-vectors-${this.account}`;
    const vectorBucket = new s3vectors.CfnVectorBucket(this, 'VectorBucket', { vectorBucketName });
    const index = new s3vectors.CfnIndex(this, 'VectorIndex', {
      vectorBucketName,
      indexName: 'owner-knowledge',
      dataType: 'float32',
      dimension: 1024,
      distanceMetric: 'cosine',
      // Chunk text + Bedrock's internal metadata are large; keep them non-filterable so the
      // 2 KB filterable-metadata budget is left for model / year / doc_type.
      metadataConfiguration: { nonFilterableMetadataKeys: ['AMAZON_BEDROCK_TEXT', 'AMAZON_BEDROCK_METADATA'] },
    });
    index.addResourceDependency(vectorBucket);

    const embeddingModelArn = `arn:aws:bedrock:${this.region}::foundation-model/${cfg.embeddingModelId}`;
    const kbRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
      }),
      description: 'Bedrock Knowledge Base service role for Owner Assist',
    });
    kbRole.addToPolicy(new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [embeddingModelArn] }));
    props.kbBucket.grantRead(kbRole);
    props.key.grantDecrypt(kbRole);
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3vectors:PutVectors', 's3vectors:GetVectors', 's3vectors:DeleteVectors', 's3vectors:QueryVectors',
        's3vectors:ListVectors', 's3vectors:GetIndex'],
      resources: [index.attrIndexArn],
    }));

    const kb = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: `${cfg.appName}-owner-knowledge`,
      description: 'Nissan owner manuals (2023-2025), warranty booklets, NHTSA recall/complaint digests, curated owner guides',
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: { dimensions: 1024, embeddingDataType: 'FLOAT32' },
          },
        },
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: { indexArn: index.attrIndexArn },
      },
    });
    kb.node.addDependency(kbRole);

    const ds = new bedrock.CfnDataSource(this, 'KnowledgeSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: 'owner-corpus',
      description: 'S3 corpus (owner-manuals/, warranty/, nhtsa/, guides/, schedules/) with .metadata.json sidecars',
      dataDeletionPolicy: 'DELETE',
      dataSourceConfiguration: { type: 'S3', s3Configuration: { bucketArn: props.kbBucket.bucketArn } },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: { maxTokens: 500, overlapPercentage: 15 },
        },
      },
    });

    const guardrailProps: bedrock.CfnGuardrailProps = {
      name: `${cfg.appName}-guardrail`,
      description: 'Owner Assist safety policy',
      blockedInputMessaging:
        "Sorry, I can't help with that request. I can answer questions about Nissan vehicles, maintenance, warranty coverage and recalls.",
      blockedOutputsMessaging:
        "Sorry, I can't provide that response. Please rephrase your question about your Nissan vehicle.",
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          // Owners legitimately describe crashes, fires and air bag injuries, and recall notices talk about
          // them too -> violence is only screened at LOW on input and not on output.
          { type: 'VIOLENCE', inputStrength: 'LOW', outputStrength: 'NONE' },
          { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'NONE' },
          // PROMPT_ATTACK is input-only; output must be NONE or creation fails.
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'SafetyOrEmissionsTampering',
            type: 'DENY',
            definition:
              'Instructions to disable, bypass or defeat vehicle emissions controls, air bags, seat belt systems, odometers or other federally required safety equipment.',
            examples: [
              'How do I delete the catalytic converter and tune the ECU to pass inspection?',
              'How can I roll back the odometer on my Altima?',
              'How do I permanently disable the passenger air bag?',
            ],
            inputEnabled: true,
            outputEnabled: false,
          },
        ],
      },
      sensitiveInformationPolicyConfig: {
        // Drivers don't need to share these to get help; block them before they reach the model or logs.
        piiEntitiesConfig: [
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK', inputAction: 'BLOCK', outputAction: 'BLOCK', inputEnabled: true, outputEnabled: true },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK', inputAction: 'BLOCK', outputAction: 'BLOCK', inputEnabled: true, outputEnabled: true },
          { type: 'US_BANK_ACCOUNT_NUMBER', action: 'BLOCK', inputAction: 'BLOCK', outputAction: 'BLOCK', inputEnabled: true, outputEnabled: true },
          { type: 'PASSWORD', action: 'BLOCK', inputAction: 'BLOCK', outputAction: 'BLOCK', inputEnabled: true, outputEnabled: true },
        ],
      },
      wordPolicyConfig: { managedWordListsConfig: [{ type: 'PROFANITY' }] },
    };
    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', guardrailProps);
    // A CfnGuardrailVersion is immutable: tie its description to a hash of the policy so any policy
    // change publishes a new numbered version (otherwise the app would keep using the old one).
    const policyHash = createHash('sha256').update(JSON.stringify(guardrailProps)).digest('hex').slice(0, 12);
    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'GuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: `Published by CDK, policy ${policyHash}`,
    });

    this.knowledgeBaseId = kb.attrKnowledgeBaseId;
    this.knowledgeBaseArn = kb.attrKnowledgeBaseArn;
    this.dataSourceId = ds.attrDataSourceId;
    this.guardrailId = guardrail.attrGuardrailId;
    this.guardrailArn = guardrail.attrGuardrailArn;
    this.guardrailVersion = guardrailVersion.attrVersion;

    new CfnOutput(this, 'KnowledgeBaseId', { value: this.knowledgeBaseId });
    new CfnOutput(this, 'DataSourceId', { value: this.dataSourceId });
    new CfnOutput(this, 'GuardrailId', { value: this.guardrailId });
    new CfnOutput(this, 'GuardrailVersionOut', { value: this.guardrailVersion });
  }
}
