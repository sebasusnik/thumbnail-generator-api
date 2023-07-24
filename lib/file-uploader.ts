import { Construct } from 'constructs';
import { 
  aws_events as events,
  aws_apigateway as apigw, 
  aws_lambda_nodejs as lambda, 
  aws_s3 as s3
} from 'aws-cdk-lib';

import { EventSource, EventDetailType } from './thumbnail-generator-api-stack';

export interface FileUploaderProps {
  eventBus: events.IEventBus;
  eventSource: EventSource;
  eventDetailType: EventDetailType;
}

export class FileUploader extends Construct {
  public readonly api: apigw.RestApi;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FileUploaderProps) {
    super(scope, id);

    this.api = new apigw.RestApi(this, 'FileUploaderApi', {
      binaryMediaTypes: ['multipart/form-data'],
    });

    this.bucket = new s3.Bucket(this, 'FileUploaderBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      publicReadAccess: true,
    });

    const fileParser = new lambda.NodejsFunction(this, 'FileParser', {
      entry: 'lambda/file-parser-lambda.ts',
      handler: 'handler',
      environment: {
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        EVENT_SOURCE: props.eventSource,
        EVENT_DETAIL_TYPE: props.eventDetailType,
        REGION: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        BUCKET_NAME: this.bucket.bucketName,
      },
    });

    props.eventBus.grantPutEventsTo(fileParser);

    this.bucket.grantReadWrite(fileParser);

    const uploadResource = this.api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigw.LambdaIntegration(fileParser));
  }
}
