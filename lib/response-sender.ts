import { Construct } from 'constructs';
import { 
  aws_events as events,
  aws_events_targets as targets,
  aws_apigateway as apigw,
  aws_lambda_nodejs as lambda
} from 'aws-cdk-lib';

export interface ResponseSenderProps {
  rule: events.Rule;
  api: apigw.RestApi;
}

export class ResponseSender extends Construct {
  constructor(scope: Construct, id: string, props: ResponseSenderProps) {
    super(scope, id);

    const responseSender = new lambda.NodejsFunction(this, 'ResponseSender', {
      entry: 'lambda/response-sender-lambda.ts',
      handler: 'handler',
      environment: {
        API_URL: props.api.url,
      },
    });

    props.rule.addTarget(new targets.LambdaFunction(responseSender));
  }
}
