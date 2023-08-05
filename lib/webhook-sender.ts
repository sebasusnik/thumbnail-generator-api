import { Construct } from 'constructs';
import {
  aws_lambda_nodejs as lambda,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions
} from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import path from 'path';

export interface WebhookSenderProps {
  topic: sns.ITopic;
}

export class WebhookSender extends Construct {
  constructor(scope: Construct, id: string, props: WebhookSenderProps) {
    super(scope, id);

    const webhookSender = new lambda.NodejsFunction(this, 'WebhookSender', {
      entry: path.join(__dirname, "../lambda", "webhook-sender-lambda.ts"),
      handler: 'handler',
      bundling: {
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
    });

    props.topic.addSubscription(new subscriptions.LambdaSubscription(webhookSender, {
      filterPolicy: {
        "callbackUrl": sns.SubscriptionFilter.stringFilter({
          allowlist: ["https", "http"]
        })
      }
    }));
  }
}
