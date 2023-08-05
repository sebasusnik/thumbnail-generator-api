import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_events as events,
  aws_sns as sns
} from 'aws-cdk-lib';

import { FileUploader } from './file-uploader';
import { ThumbnailGenerator } from './thumbnail-generator';
import { DataStorer } from './data-storer';
import { WebhookSender } from './webhook-sender';
import { GetThumbnails } from './get-thumbnails';

export enum EventSource {
  LAMBDA_A = 'FileParser',
  LAMBDA_B = 'ImageResizer',
}

export enum EventDetailType {
  IMAGE_UPLOADED = 'ImageUploaded',
  THUMBNAILS_GENERATED = 'ThumbnailsGenerated',
}

export class ThumbnailGeneratorApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const eventBus = new events.EventBus(this, 'MyEventBus');

    const imageUploadedRule = new events.Rule(this, 'ImageUploadedRule', {
      eventBus: eventBus,
      eventPattern: {
        source: [EventSource.LAMBDA_A],
        detailType: [EventDetailType.IMAGE_UPLOADED],
      },
    });

    const thumbnailsGeneratedRule = new events.Rule(this, 'ThumbnailsGeneratedRule', {
      eventBus: eventBus,
      eventPattern: {
        source: [EventSource.LAMBDA_B],
        detailType: [EventDetailType.THUMBNAILS_GENERATED],
      },
    });

    const fileUploader = new FileUploader(this, 'FileUploader', {
      eventBus: eventBus,
      eventSource: EventSource.LAMBDA_A,
      eventDetailType: EventDetailType.IMAGE_UPLOADED,
    });

    const thumbnailGenerator = new ThumbnailGenerator(this, 'ThumbnailGenerator', {
      eventBus: eventBus,
      rule: imageUploadedRule,
      bucket: fileUploader.bucket,
      eventSource: EventSource.LAMBDA_B,
      eventDetailType: EventDetailType.THUMBNAILS_GENERATED,
    });

    const dataStorer = new DataStorer(this, 'DataStorer', {
      rule: thumbnailsGeneratedRule,
    });

    const webhookSender = new WebhookSender(this, 'WebhookSender', {
      topic: thumbnailGenerator.topic,
    });

    const getThumbnails = new GetThumbnails (this, 'GetThumbnails', {
      api: fileUploader.api,
      dataTable: dataStorer.dataTable
    });
  }
}
