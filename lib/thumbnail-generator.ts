import { Construct } from 'constructs';
import {
  aws_events as events,
  aws_s3 as s3,
  aws_sqs as sqs,
  aws_lambda_nodejs as lambda,
  aws_events_targets as targets,
  Duration
} from 'aws-cdk-lib';

import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

import { EventSource, EventDetailType } from './thumbnail-generator-api-stack';
import { ImageResizer } from './image-resizer';

export interface ImageDimensions {
  small: {
    width: number;
    height: number;
  };
  medium: {
    width: number;
    height: number;
  };
  large: {
    width: number;
    height: number;
  };
}

export interface ThumbnailGeneratorProps {
  eventBus: events.IEventBus;
  inputRule: events.Rule;
  bucket: s3.IBucket;
  eventSource: EventSource;
  eventDetailType: EventDetailType;
}

export class ThumbnailGenerator extends Construct {

  constructor(scope: Construct, id: string, props: ThumbnailGeneratorProps) {
    super(scope, id);

    const IMAGE_DIMENSIONS: ImageDimensions = {
      small: {
        width: 400,
        height: 300
      },
      medium: {
        width: 160,
        height: 120
      },
      large: {
        width: 120,
        height: 120,
      }
    };

    // Create an SQS queue
    const queue = new sqs.Queue(this, 'Queue', {
      // Set the fifo property to true
      fifo: true,
      // The name of the queue must end with .fifo
      queueName: 'thumbnails.fifo'
    });

    // Get the queue URL from the queue object
    const queueUrl = queue.queueUrl;

    // Pass the output rule and the custom event bus as props to the ImageResizer construct
    const imageResizerSmall = new ImageResizer(this, 'ImageResizerSmall', {
      ...props,
      dimensions: IMAGE_DIMENSIONS.small,
      // Pass the queue URL
      queueUrl: queueUrl,
      // Specify a message group ID for each message
      messageGroupId: 'thumbnails-group'
    });

    const imageResizerMedium = new ImageResizer(this, 'ImageResizerMedium', {
      ...props,
      dimensions: IMAGE_DIMENSIONS.medium,
      // Pass the queue URL
      queueUrl: queueUrl,
      // Specify a message group ID for each message
      messageGroupId: 'thumbnails-group'
    });

    const imageResizerLarge = new ImageResizer(this, 'ImageResizerLarge', {
      ...props,
      dimensions: IMAGE_DIMENSIONS.large,
      // Pass the queue URL
      queueUrl: queueUrl,
      // Specify a message group ID for each message
      messageGroupId: 'thumbnails-group'
    });

    const aggregator = new lambda.NodejsFunction(this, 'Aggregator', {
      entry: 'lambda/thumbnail-aggregator.ts',
      handler: 'handler',
      environment: {
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        EVENT_SOURCE: props.eventSource,
        EVENT_DETAIL_TYPE: props.eventDetailType,
        QUEUE_URL: queue.queueUrl,
      },
    });

    // Grant permissions to the lambdas
    queue.grantSendMessages(imageResizerSmall.function)
    queue.grantSendMessages(imageResizerMedium.function)
    queue.grantSendMessages(imageResizerLarge.function)

    // Create an SQS event source for the Node.js function
    const eventSource = new SqsEventSource(queue, { batchSize: 3});

    // Add the SQS event source to the Node.js function
    aggregator.addEventSource(eventSource);

    // Add permissions for the Node.js function to emit events to the default event bus
    props.eventBus.grantPutEventsTo(aggregator);
  }
}
