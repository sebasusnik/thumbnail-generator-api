import { Construct } from "constructs";
import {
  aws_apigateway as apigw,
  aws_lambda_nodejs as lambda,
} from 'aws-cdk-lib';

import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import path from "path";

export interface GetThumbnailsProps {
  api: apigw.RestApi;
  dataTable: Table;
}

export class GetThumbnails extends Construct {
  constructor(scope: Construct, id: string, props: GetThumbnailsProps) {
    super(scope, id);

    const { api, dataTable } = props;

    const getThumbnailsLambda = new lambda.NodejsFunction(this, 'GetThumbnailsLambda', {
      entry: path.join(__dirname, "../lambda", "get-thumbnails-lambda.ts"),
      handler: 'handler',
      environment: {
        REGION: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        TABLE_NAME: dataTable.tableName,
      },
      bundling: {
        minify: true,
        target: 'node18',
      },
      runtime: Runtime.NODEJS_18_X,
    });

    dataTable.grantReadData(getThumbnailsLambda);

    const getThumbnailsIntegration = new apigw.LambdaIntegration(getThumbnailsLambda);

    const downloadResource = api.root.addResource('thumbnails');
    downloadResource.addMethod('GET', getThumbnailsIntegration, {
      apiKeyRequired: true
    })
  }
}