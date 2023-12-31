import { Construct } from 'constructs';
import { 
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda_nodejs as lambda,
  aws_dynamodb as dynamodb
} from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import path from 'path';

export interface DataStorerProps {
  rule: events.Rule;
}

export class DataStorer extends Construct {
  public readonly dataTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStorerProps) {
    super(scope, id);

    this.dataTable = new dynamodb.Table(this, 'DataTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'size', type: dynamodb.AttributeType.STRING },
    });

    const dataStorer = new lambda.NodejsFunction(this, 'DataStorer', {
      entry: path.join(__dirname, "../lambda", "data-storer-lambda.ts"),
      handler: 'handler',
      environment: {
        TABLE_NAME: this.dataTable.tableName,
        REGION: process.env.CDK_DEFAULT_REGION || 'us-east-1',
      },
      bundling: {
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
    });

    this.dataTable.grantWriteData(dataStorer);
    const dataStorerTarget = new targets.LambdaFunction(dataStorer);
    props.rule.addTarget(dataStorerTarget);
  }
}
