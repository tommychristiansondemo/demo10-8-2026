import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AppConfig } from './config';

/**
 * Stateful resources: customer-managed KMS key, the application table (single-table design),
 * and the knowledge-base source bucket (owner's manuals, NHTSA digests, curated guides).
 * Class demo => RemovalPolicy.DESTROY everywhere so teardown leaves nothing behind.
 */
export class DataStack extends Stack {
  readonly key: kms.Key;
  readonly table: dynamodb.TableV2;
  readonly kbBucket: s3.Bucket;

  constructor(scope: Construct, id: string, cfg: AppConfig, props?: StackProps) {
    super(scope, id, props);

    this.key = new kms.Key(this, 'DataKey', {
      alias: `alias/${cfg.appName}-data`,
      description: 'Owner Assist application data (DynamoDB, KB source bucket)',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
      pendingWindow: Duration.days(7),
    });

    // PK/SK patterns:
    //   USER#<sub> | VEHICLE#<id>        garage vehicle
    //   USER#<sub> | CONV#<id>           conversation (title + recent turns), TTL 90 days
    //   USER#<sub> | FEEDBACK#<msgId>    thumbs up/down on an answer
    this.table = new dynamodb.TableV2(this, 'AppTable', {
      tableName: `${cfg.appName}-app`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      encryption: dynamodb.TableEncryptionV2.customerManagedKey(this.key),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.kbBucket = new s3.Bucket(this, 'KnowledgeSource', {
      bucketName: `${cfg.appName}-kb-source-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.key,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }
}
