import { Construct } from 'constructs';
import {
  aws_events as events,
  aws_apigateway as apigw,
  aws_lambda_nodejs as lambda,
  aws_s3 as s3,
  CfnOutput
} from 'aws-cdk-lib';

import { EventSource, EventDetailType } from './thumbnail-generator-api-stack';
import { Cors } from 'aws-cdk-lib/aws-apigateway';
import path from 'path';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface FileUploaderProps {
  eventBus: events.IEventBus;
  eventSource: EventSource;
  eventDetailType: EventDetailType;
}

export class FileUploader extends Construct {
  public readonly api: apigw.RestApi;
  public readonly bucket: s3.Bucket;
  public readonly apiKey: apigw.ApiKey;

  constructor(scope: Construct, id: string, props: FileUploaderProps) {
    super(scope, id);

    this.api = new apigw.RestApi(this, 'FileUploaderApi', {
      binaryMediaTypes: ['multipart/form-data'],
      defaultCorsPreflightOptions: {
        allowOrigins: ["http://localhost:3000", "https://thumbnail-generator-client.vercel.app"],
        allowMethods: ["POST"],
        allowHeaders: [...Cors.DEFAULT_HEADERS, 'X-Callback-URL'],
      }
    });

    this.apiKey = new apigw.ApiKey(this, 'FileApiKey', {
      apiKeyName: 'file-api-key',
      description: 'API key for file service',
      enabled: true
    });

    const usagePlan = new apigw.UsagePlan(this, 'FileUsagePlan', {
      name: 'file-usage-plan',
      apiStages: [{
        api: this.api,
        stage: this.api.deploymentStage
      }]
    });

    usagePlan.addApiKey(this.apiKey);

    this.bucket = new s3.Bucket(this, 'FileUploaderBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false
      }),
    });

    const fileUploader = new lambda.NodejsFunction(this, 'FileUploader', {
      entry: path.join(__dirname, "../lambda", "file-uploader-lambda.ts"),
      handler: 'handler',
      environment: {
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        EVENT_SOURCE: props.eventSource,
        EVENT_DETAIL_TYPE: props.eventDetailType,
        REGION: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        BUCKET_NAME: this.bucket.bucketName,
      },
      bundling: {
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
      memorySize: 512,
    });

    props.eventBus.grantPutEventsTo(fileUploader);

    this.bucket.grantReadWrite(fileUploader);

    const uploadResource = this.api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigw.LambdaIntegration(fileUploader), {
      apiKeyRequired: true
    });

    new CfnOutput(this, 'ApiArnOutput', {
      value: this.apiKey.keyId,
      description: 'The API key value for file service'
    });
  }
}
