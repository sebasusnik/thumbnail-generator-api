import { Construct } from 'constructs';
import { 
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda_nodejs as lambda,
  aws_dynamodb as dynamodb
} from 'aws-cdk-lib';

export interface DataStorerProps {
  rule: events.Rule;
}

export class DataStorer extends Construct {
  constructor(scope: Construct, id: string, props: DataStorerProps) {
    super(scope, id);

    const dataTable = new dynamodb.Table(this, 'DataTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'size', type: dynamodb.AttributeType.STRING },
    });

    const dataStorer = new lambda.NodejsFunction(this, 'DataStorer', {
      entry: 'lambda/data-storer-lambda.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: dataTable.tableName,
      },
    });

    dataTable.grantWriteData(dataStorer);
    const dataStorerTarget = new targets.LambdaFunction(dataStorer);
    props.rule.addTarget(dataStorerTarget);
  }
}
