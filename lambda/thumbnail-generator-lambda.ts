import * as https from 'https';
import sharp from 'sharp';
import { S3, EventBridge, SNS } from 'aws-sdk';
import { EventBridgeEvent } from 'aws-lambda';
import { MessageAttributeMap } from 'aws-sdk/clients/sns';
import { Readable } from 'stream';

type UploadOutput = S3.ManagedUpload.SendData;

type ImageDimensions = {
  width: number;
  height: number;
};

type Metadata = {
  fileSize: number;
  type: "image/jpeg" | "image/png";
  filename: string;
};

type Thumbnail = {
  size: {
    width: number;
    height: number;
  };
  url: string;
};

type InputEventDetail = {
  ID: string;
  fileUrl: string;
  metadata: Metadata;
  callbackUrl: string;
};

type OutputEventDetail = {
  ID: string;
  originalImageUrl: string;
  thumbnails: Thumbnail[];
  metadata: Metadata;
  callbackUrl: string;
};

interface Event extends EventBridgeEvent<string, InputEventDetail> { }

const IMAGE_DIMENSIONS: ImageDimensions[] = JSON.parse(process.env.IMAGE_DIMENSIONS || "");
const BUCKET_NAME = process.env.BUCKET_NAME;
const TOPIC_ARN = process.env.TOPIC_ARN;

const sns = new SNS({ region: process.env.REGION });
const eventBridge = new EventBridge({ region: process.env.REGION });

async function getImageStream(fileUrl: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, (res) => { // send a GET request to the image URL
      if (res.statusCode !== 200) { // check if the response is OK
        reject(new Error(`Request failed with status code ${res.statusCode}`));
      } else {
        resolve(res); // resolve with the response stream
      }
    }).on('error', (err) => { // handle errors
      reject(err);
    });
  });
}

async function resizeImageStream(imageStream: Readable, metadata: Metadata, width: number, height: number): Promise<UploadOutput> {
  if (!BUCKET_NAME) throw new Error('BUCKET_NAME environment variable is not defined');
  const newFileName = `${metadata.filename}-${width}x${height}.${metadata.type.split('/')[1]}`;
  console.log(`New file name for size: ${newFileName}`);
  console.log("Uploading file...");
  const s3 = new S3();
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: newFileName,
    ContentType: metadata.type,
    Body: imageStream.pipe(sharp().resize(width, height)) // pipe the image stream to sharp and resize it
  };
  const uploadOutput = await s3.upload(uploadParams).promise(); // upload the resized stream to S3
  console.log(`Uploaded resized stream for size to bucket ${BUCKET_NAME}`);
  return uploadOutput; // return the uploaded file URL
}

async function generateThumbnails(fileUrl: string, metadata: Metadata): Promise<Thumbnail[]> {
  const thumbnails = [];
  for (const { width, height } of IMAGE_DIMENSIONS) {
    const imageStream = await getImageStream(fileUrl); // get the image stream from the URL
    const uploadOutput = await resizeImageStream(imageStream, metadata, width, height); // resize and upload the image stream
    thumbnails.push({
      size: { width, height },
      url: uploadOutput.Location
    });
  }
  return thumbnails;
}

function createEvents(ID: string, fileUrl: string, metadata: Metadata, thumbnails: Thumbnail[], callbackUrl: string): { message: string; eventDetail: OutputEventDetail } {
  const eventDetail: OutputEventDetail = {
    ID,
    originalImageUrl: fileUrl,
    thumbnails,
    metadata,
    callbackUrl
  };

  console.log(`Event detail for thumbnailsGenerated: ${JSON.stringify(eventDetail)}`);

  const message = JSON.stringify(eventDetail);

  console.log(`SNS Message for Webhook Sender: ${message}`);

  return { message, eventDetail };
}

const publishSNSMessage = async ( message: string, messageAttribute?: MessageAttributeMap  ) => {

  console.log("Sending SNS Message...", {messageAttribute, message})
  const messageResponse = sns.publish({
    TopicArn: TOPIC_ARN,
    Message: message,
    MessageAttributes: messageAttribute
  }).promise();

  return messageResponse;
};

async function publishEvent(eventDetail: OutputEventDetail): Promise<EventBridge.PutEventsResponse> {

  console.log("Publishing event...");
  const putEventsResponse: EventBridge.PutEventsResponse = await eventBridge.putEvents({
    Entries: [{
      Source: process.env.EVENT_SOURCE,
      DetailType: process.env.EVENT_DETAIL_TYPE,
      Detail: JSON.stringify(eventDetail),
      EventBusName: process.env.EVENT_BUS_NAME
    }]
  }).promise();

  return putEventsResponse;
}

export async function handler(event: Event): Promise<{ statusCode: number; body: string }> {
  try {
    const { ID, fileUrl, metadata, callbackUrl } = event.detail;

    const thumbnails = await generateThumbnails(fileUrl, metadata);

    const { message, eventDetail } = createEvents(ID, fileUrl, metadata, thumbnails, callbackUrl);

    const urlRegex = /^https?:\/\/[^\s]+$/; // a regular expression to match a valid URL

    if (urlRegex.test(callbackUrl)) {
      const messageResponse = await publishSNSMessage( message );
      console.log("SNS Message response", messageResponse)
    }

    await publishEvent(eventDetail);

    return { statusCode: 200, body: 'Thumbnails generated successfully' };

  } catch (error) {
    console.error(error);

    return { statusCode: 500, body: `Something went wrong:${error}` };
  }
};
