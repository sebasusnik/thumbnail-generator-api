import { Construct } from 'constructs';
import {
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda_nodejs as lambda,
  Duration
} from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface ResponseSenderProps {
  rule: events.Rule;
}

export class ResponseSender extends Construct {
  constructor(scope: Construct, id: string, props: ResponseSenderProps) {
    super(scope, id);

    const responseSender = new lambda.NodejsFunction(this, 'ResponseSender', {
      entry: 'lambda/response-sender-lambda.ts',
      handler: 'handler',
      bundling: {
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
    });

    props.rule.addTarget(new targets.LambdaFunction(responseSender));
  }
}
