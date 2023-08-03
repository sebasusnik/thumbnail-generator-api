import axios from 'axios';
import sharp from 'sharp';
import { S3, EventBridge } from 'aws-sdk';
import { EventBridgeEvent } from 'aws-lambda';

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
  fileSize: number
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

const eventBridge = new EventBridge({ region: process.env.REGION });

async function getImageBuffer(fileUrl: string): Promise<Buffer> {
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(response.data, 'binary');
  console.log(`Image buffer size: ${imageBuffer.length} bytes`);
  return imageBuffer;
}

async function resizeImageBuffer(imageBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  const resizedBuffer = await sharp(imageBuffer)
    .resize(width, height)
    .toBuffer();
  console.log(`Resized buffer size: ${resizedBuffer.length} bytes`);
  return resizedBuffer;
}

async function uploadResizedBuffer(resizedBuffer: Buffer, metadata: Metadata, width: number, height: number): Promise<string> {
  if (!BUCKET_NAME) throw new Error('BUCKET_NAME environment variable is not defined');

  const newFileName = `${metadata.filename}-${width}x${height}.${metadata.type.split('/')[1]}`;

  console.log(`New file name for size: ${newFileName}`);

  console.log("Uploading file...");

  const s3 = new S3();
  const putObjectOutput: S3.PutObjectOutput = await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: newFileName,
    Body: resizedBuffer,
    ContentType: metadata.type,
  }).promise();

  console.log(`Uploaded resized buffer for size to bucket ${BUCKET_NAME}`);

  return `https://s3.amazonaws.com/${BUCKET_NAME}/${newFileName}`;
}

function createEventDetail(ID: string, fileUrl: string, metadata: Metadata, thumbnails: Thumbnail[], callbackUrl: string): OutputEventDetail {
  const eventDetail: OutputEventDetail = {
    ID,
    originalImageUrl: fileUrl,
    thumbnails,
    metadata,
    callbackUrl
  };

  console.log(`Event detail for thumbnailsGenerated: ${JSON.stringify(eventDetail)}`);

  return eventDetail;
}

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

async function generateThumbnails(fileUrl: string, metadata: Metadata): Promise<Thumbnail[]> {

  const imageBuffer = await getImageBuffer(fileUrl);

  const thumbnails = [];

  for (const { width, height } of IMAGE_DIMENSIONS) {

    const resizedBuffer = await resizeImageBuffer(imageBuffer, width, height);

    const url = await uploadResizedBuffer(resizedBuffer, metadata, width, height);

    thumbnails.push({
      size: { width, height },
      fileSize: resizedBuffer.byteLength,
      url
    });

  }

  return thumbnails;
}

export async function handler(event: Event): Promise<{ statusCode: number; body: string }> {
  try {
    const { ID, fileUrl, metadata, callbackUrl } = event.detail;

    const thumbnails = await generateThumbnails(fileUrl, metadata);

    const eventDetail = createEventDetail(ID, fileUrl, metadata, thumbnails, callbackUrl);

    await publishEvent(eventDetail);

    return { statusCode: 200, body: 'Thumbnails generated successfully' };

  } catch (error) {
    console.error(error);

    return { statusCode: 500, body: 'Something went wrong' };
  }
};
