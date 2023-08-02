import { Construct } from 'constructs';
import {
  aws_events as events,
  aws_s3 as s3,
  aws_lambda_nodejs as lambda,
  aws_events_targets as targets,
  Duration
} from 'aws-cdk-lib';

import { Runtime } from 'aws-cdk-lib/aws-lambda';

import { EventSource, EventDetailType } from './thumbnail-generator-api-stack';

type ImageDimensions = {
  width: number;
  height: number;
};

export interface ThumbnailGeneratorProps {
  eventBus: events.IEventBus;
  rule: events.Rule;
  bucket: s3.IBucket;
  eventSource: EventSource;
  eventDetailType: EventDetailType;
}

export class ThumbnailGenerator extends Construct {

  constructor(scope: Construct, id: string, props: ThumbnailGeneratorProps) {
    super(scope, id);

    const IMAGE_DIMENSIONS: ImageDimensions[] = [
      {
        width: 400,
        height: 300
      },
      {
        width: 160,
        height: 120
      },
      {
        width: 120,
        height: 120
      }
    ];

    const imageResizer = new lambda.NodejsFunction(this, 'ImageResizer', {
      entry: 'lambda/image-resizer-lambda.ts',
      handler: 'handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        IMAGE_DIMENSIONS: JSON.stringify(IMAGE_DIMENSIONS),
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        EVENT_SOURCE: props.eventSource,
        EVENT_DETAIL_TYPE: props.eventDetailType,
        REGION: process.env.CDK_DEFAULT_REGION || 'us-east-1',
      },
      bundling: {
        forceDockerBundling: true,
        nodeModules: ['sharp', 'axios'],
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
      memorySize: 512,
      timeout: Duration.seconds(10),
    });

    props.bucket.grantReadWrite(imageResizer);

    props.rule.addTarget(new targets.LambdaFunction(imageResizer));

    props.eventBus.grantPutEventsTo(imageResizer);
  }
}
