import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_events as events,
} from 'aws-cdk-lib';

// Import L3 constructs
import { FileUploader } from './file-uploader';
import { ThumbnailGenerator } from './thumbnail-generator';
import { DataStorer } from './data-storer';
import { ResponseSender } from './response-sender';

// Define an enum for the event source
export enum EventSource {
  LAMBDA_A = 'FileParser',
  LAMBDA_B = 'ImageResizer',
}

// Define an enum for the event detail type
export enum EventDetailType {
  IMAGE_UPLOADED = 'ImageUploaded',
  THUMBNAILS_GENERATED = 'ThumbnailsGenerated', // Change the name of the event
}

export class ThumbnailGeneratorApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an EventBridge event bus
    const eventBus = new events.EventBus(this, 'MyEventBus');

    // Create an EventBridge rule for 'ImageUploaded' events
    const imageUploadedRule = new events.Rule(this, 'ImageUploadedRule', {
      eventBus: eventBus,
      eventPattern: {
        source: [EventSource.LAMBDA_A],
        detailType: [EventDetailType.IMAGE_UPLOADED],
      },
    });

    // Create an EventBridge rule for 'ThumbnailsGenerated' events
    const thumbnailsGeneratedRule = new events.Rule(this, 'ThumbnailsGeneratedRule', {
      eventBus: eventBus,
      eventPattern: {
        source: [EventSource.LAMBDA_B],
        detailType: [EventDetailType.THUMBNAILS_GENERATED],
      },
    });

    // Create a file uploader construct
    const fileUploader = new FileUploader(this, 'FileUploader', {
      eventBus: eventBus,
      eventSource: EventSource.LAMBDA_A,
      eventDetailType: EventDetailType.IMAGE_UPLOADED,
    });

    // Create a thumbnail generator construct
    const thumbnailGenerator = new ThumbnailGenerator(this, 'ThumbnailGenerator', {
      eventBus: eventBus,
      rule: imageUploadedRule,
      bucket: fileUploader.bucket,
      eventSource: EventSource.LAMBDA_B,
      eventDetailType: EventDetailType.THUMBNAILS_GENERATED,
    });

    // Create a data storer construct
    const dataStorer = new DataStorer(this, 'DataStorer', {
      rule: thumbnailsGeneratedRule,
    });

    // Create a response sender construct
    const responseSender = new ResponseSender(this, 'ResponseSender', {
      rule: thumbnailsGeneratedRule,
    });
  }
}
