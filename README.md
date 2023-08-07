# Thumbnail Generator API

This is an API that generates thumbnails of different sizes for any image uploaded to it. It uses AWS CDK v2, AWS Lambda, AWS S3, AWS EventBridge, AWS SNS, and AWS DynamoDB to create an event driven serverless architecture.

The API generates three thumbnails with the following dimensions: 120x120, 160x120, and 400x300 pixels.

## Table of Contents

- [Thumbnail Generator API](#thumbnail-generator-api)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Deployment](#deployment)
  - [Usage](#usage)
    - [Example](#example)
      - [POST request](#post-request)
      - [GET request](#get-request)
      - [Webhook event](#webhook-event)
  - [Architecture](#architecture)
  - [API Documentation](#api-documentation)

## Prerequisites

To use this API, you need the following:

- An AWS account with permission to deploy resources
- AWS CLI installed and configured
- AWS CDK CLI installed
- Node.js and npm installed
- Docker installed

## Installation

This project requires Node.js and npm to run. Follow these steps to set up the project on your local machine:

1. Clone the repository from GitHub using the following command:

```bash
git clone https://github.com/sebasusnik/thumbnail-generator-api.git
```

2. Install the dependencies for the project using the following command:

```bash
npm install
```

## Deployment

To deploy the API to your AWS account, run the following commands in the root directory:

```bash
cdk bootstrap
cdk synth
cdk deploy
```

The output of the `cdk deploy` command will show you the API Key ID and the API endpoint. You will need the API key ID to get the API key, which is required to use the API. To get the API key, run the following command with your API key ID:

```bash
aws apigateway get-api-key --api-key <api key id output> --include-value
```

The output of this command will show you the value of the API key. Copy and save it somewhere secure.

## Usage

To use the API, you need to do two steps:

1. Send a POST request to `https://<api id>.execute-api.<region>.amazonaws.com/prod/upload` with a PNG or JPG file as multipart/form-data, and the API key as a header. You can also include an optional header `X-Callback-URL` with an endpoint to receive the thumbnails as a webhook.
2. Send a GET request to `https://<api id>.execute-api.<region>.amazonaws.com/prod/thumbnails?id=<image id>` with the image ID returned by the POST request to receive the thumbnails.

### Example

Here is an example of how to use the API with curl:

#### POST request

With callback URL:

```bash
curl -X POST \
  -H "x-api-key: <your api key>" \
  -H "X-Callback-URL: <your callback url>" \
  -F "file=@<your image file>" \
  https://<api id>.execute-api.<region>.amazonaws.com/prod/upload
```

Expected response:

```json
{
	"message": "Image uploaded successfully. It will be processed in the background. A webhook event will be sent after processing is complete.",
	"id": "<image id>"
}
```

Without callback URL:

```bash
curl -X POST \
  -H "x-api-key: <your api key>" \
  -F "file=@<your image file>" \
  https://<api id>.execute-api.<region>.amazonaws.com/prod/upload
```

Expected response:

```json
{
	"message": "Image uploaded successfully. It will be processed in the background. You can query the image with the ID.",
	"id": "<image id>"
}
```

#### GET request

```bash
curl -X GET \
  -H "x-api-key: <your api key>" \
  https://<api id>.execute-api.<region>.amazonaws.com/prod/thumbnails?id=<image id>
```

Expected response:

```json
{
	"originalImageUrl": "<original image url>",
	"thumbnails": [
		{
			"size": {
				"width": 120,
				"height": 120
			},
			"fileSize": <file size in bytes>,
			"url": "<thumbnail url>"
		},
		{
			"size": {
				"width": 160,
				"height": 120
			},
			"fileSize": <file size in bytes>,
			"url": "<thumbnail url>"
		},
		{
			"size": {
				"width": 400,
				"height": 300
			},
			"fileSize": <file size in bytes>,
			"url": "<thumbnail url>"
		}
	],
	"metadata": {
		"fileSize": <file size in bytes>,
		"type": "<image type>",
		"filename": "<image filename>"
	}
}
```

#### Webhook event

If you provided a `X-Callback-URL` header in the POST request, you will receive a webhook event with the same data as the GET request after the thumbnails are generated.

## Architecture

The architecture of the API consists of the following components:

- A REST API gateway that exposes two endpoints: `/upload` and `/thumbnails`.
- A file-uploader lambda function that handles the POST requests to `/upload`, validates the input, uploads the original image to an S3 bucket, and publish an event to an EventBridge bus with the image metadata and the optional callback URL.
- A thumbnail-generator lambda function that subscribes to the image uploaded events, downloads the original image from the S3 bucket, generates three thumbnails of different sizes, uploads them to the same S3 bucket, and publishes both an EventBridge event and an SNS message with the thumbnail metadata and the optional callback URL.
- A data storer lambda function that subscribes to the thumbnails generated events from EventBridge, and stores the thumbnail metadata in a DynamoDB table.
- A get-thumbnails lambda function that handles the GET requests to `/thumbnails?id=<image id>`, queries the DynamoDB table with the image ID as a query parameter, and returns a response with the thumbnails metadata and URLs.
- A webhook-sender lambda function that subscribes to the messages from SNS with a filter policy that only allows messages that have a callback URL in the payload, and sends a POST request to the callback URL provided by the user with the thumbnail metadata as the payload.

The following diagram illustrates the architecture of the API:

[![Architecture diagram](https://i.imgur.com/PaNSivd.png)](https://excalidraw.com/#json=Fll32M-JDvmgA6wGZruIr,LJIk_ENVIEIvl-ntFO_45A)

The following diagram shows an example of how a client interacts with the API:

[![Client-API communication](https://i.imgur.com/qwOOWCM.png)](https://excalidraw.com/#json=lddTiuRoFRIBVItpln0ZP,5uYjsyVnkvre_atSy9OilA)

## API Documentation

For more details on the API endpoints, parameters, responses, and errors, you can check out the [Postman collection](https://documenter.getpostman.com/view/28869574/2s9XxySZZk) that documents the API.

