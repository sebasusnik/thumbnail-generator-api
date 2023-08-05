import * as https from 'https';
import { SNSEvent, Context } from 'aws-lambda';
import { IncomingMessage } from 'http';

interface EventDetail {
  ID: string;
  callbackUrl: string;
  originalImageUrl: string;
  thumbnails: Array<{
    size: {
      width: number;
      height: number;
    };
    fileSize: number;
    url: string;
  }>;
}

interface ReturnValue {
  statusCode: number;
  body: unknown;
}

const sendResponse = async (data: EventDetail) => {

  console.log(`Sending data: ${JSON.stringify(data)}`);

  const callbackUrl = data.callbackUrl;

  console.log(`Callback URL: ${JSON.stringify(callbackUrl)}`)

  const url = new URL(callbackUrl);

  console.log(`Callback URL hostname: ${JSON.stringify(url.hostname)}`)
  console.log(`Callback URL pathname: ${JSON.stringify(url.pathname)}`)
  console.log(`Callback URL port: ${JSON.stringify(url.port)}`)

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    port: url.port ? url.port : '',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*'
    }
  };

  console.log(`Request options: ${JSON.stringify(options)}`)

  const postRequest = new Promise((resolve, reject) => {
    const req = https.request(options, (res: IncomingMessage) => {

      console.log(`Status code: ${res.statusCode}`);
      console.log(`Headers: ${JSON.stringify(res.headers)}`);

      res.on('data', (chunk: Buffer | string) => {
        console.log(`Response: ${chunk}`);
      });
      res.on('end', () => {
        resolve('Request completed');
      });
    });

    req.on('error', (error: Error) => {
      console.error(`Error: ${error.message}`);
      console.error(error.stack);
      reject(error);
    });

    req.write(JSON.stringify(data));

    req.end();
  });

  try {
    const result = await postRequest;
    return {
      statusCode: 200,
      body: result,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: (error as Error).message,
    };
  }
};

export const handler = async (event: SNSEvent, context: Context): Promise<ReturnValue> => {
  console.log(`Received event: ${JSON.stringify(event)}`);
  
  let message = event.Records[0].Sns.Message;

  let messageObject = JSON.parse (message);

  console.log (messageObject); 
  
  return await sendResponse(messageObject);
};