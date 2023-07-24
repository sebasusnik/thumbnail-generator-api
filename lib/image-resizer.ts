import { Construct } from 'constructs';
import {
  aws_s3 as s3,
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda_nodejs as lambda,
  Duration
} from 'aws-cdk-lib';

import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { IGrantable } from 'aws-cdk-lib/aws-iam';

export interface ImageResizerProps {
  eventBus: events.IEventBus;
  inputRule: events.Rule;
  bucket: s3.IBucket;
  queueUrl: string;
  messageGroupId: string;
  dimensions: {
    width: number;
    height: number;
  };
}

export class ImageResizer extends Construct {

  // Add a public property for the grantPrincipal and function
  public readonly grantPrincipal: IGrantable;
  public readonly function: lambda.NodejsFunction;

  constructor(scope: Construct, id: string, props: ImageResizerProps) {
    super(scope, id);

    this.function = new lambda.NodejsFunction(this, 'ImageResizer', {
      entry: 'lambda/image-resizer-lambda.ts',
      handler: 'handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        QUEUE_URL: props.queueUrl,
        MESSAGE_GROUP: props.messageGroupId,
        WIDTH: props.dimensions.width.toString(),
        HEIGHT: props.dimensions.height.toString(),
      },
      bundling: {
        forceDockerBundling: true,
        nodeModules: ['sharp', 'axios'],
      },
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
    });

    // Assign the lambda function object to the grantPrincipal property
    this.grantPrincipal = this.function;

    // Grant read/write permissions to the bucket
    props.bucket.grantReadWrite(this.function);

    // Add the lambda function as a target for the input rule
    props.inputRule.addTarget(new targets.LambdaFunction(this.function));
  }
}
