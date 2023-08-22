import { Construct } from 'constructs';
import {
  aws_events as events,
  aws_s3 as s3,
  aws_lambda_nodejs as lambda,
  aws_events_targets as targets,
  aws_sns as sns,
  Duration
} from 'aws-cdk-lib';

import { Runtime } from 'aws-cdk-lib/aws-lambda';

import { EventSource, EventDetailType } from './thumbnail-generator-api-stack';
import path from 'path';

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
  public readonly topic: sns.ITopic

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

    this.topic = new sns.Topic(this, 'ThumbnailsGeneratedTopic', {
      displayName: 'Thumbnails Generated Topic',
    });

    const thumbnailGenerator = new lambda.NodejsFunction(this, 'ThumbnailGenerator', {
      entry: path.join(__dirname, "../lambda", "thumbnail-generator-lambda.ts"),
      handler: 'handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        IMAGE_DIMENSIONS: JSON.stringify(IMAGE_DIMENSIONS),
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        EVENT_SOURCE: props.eventSource,
        EVENT_DETAIL_TYPE: props.eventDetailType,
        REGION: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        TOPIC_ARN: this.topic.topicArn
      },
      bundling: {
        forceDockerBundling: true,
        nodeModules: ['sharp'],
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
      memorySize: 512,
      timeout: Duration.seconds(10),
    });

    props.bucket.grantReadWrite(thumbnailGenerator);

    this.topic.grantPublish(thumbnailGenerator)

    props.rule.addTarget(new targets.LambdaFunction(thumbnailGenerator));

    props.eventBus.grantPutEventsTo(thumbnailGenerator);
  }
}
