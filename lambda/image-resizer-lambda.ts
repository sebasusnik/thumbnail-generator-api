import axios from 'axios';
import sharp from 'sharp';
import { S3 } from 'aws-sdk';
import { EventBridge } from 'aws-sdk';

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

type EventDetail = {
  originalImageUrl: string;
  thumbnails: Thumbnail[];
  metadata: Metadata;
};

interface Event {
  detail: {
    fileUrl: string;
    metadata: Metadata;
  };
}

// Use an array instead of an object to store image dimensions
const IMAGE_DIMENSIONS: ImageDimensions[] = JSON.parse(process.env.IMAGE_DIMENSIONS || "");

const BUCKET_NAME = process.env.BUCKET_NAME;

const eventBridge = new EventBridge({ region: process.env.REGION });

// Helper function to get the image buffer from the file URL
async function getImageBuffer(fileUrl: string) {
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(response.data, 'binary');
  console.log(`Image buffer size: ${imageBuffer.length} bytes`);
  return imageBuffer;
}

// Helper function to resize the image buffer for a given size
async function resizeImageBuffer(imageBuffer: Buffer, width: number, height: number) {
  console.log(`Resizing image for size: ${JSON.stringify({width, height})}`);
  const resizedBuffer = await sharp(imageBuffer)
    .resize(width, height)
    .toBuffer();
  console.log(`Resized buffer size for size: ${resizedBuffer.length} bytes`);
  return resizedBuffer;
}

// Helper function to upload the resized buffer to S3
async function uploadResizedBuffer(resizedBuffer: Buffer, metadata: Metadata, width: number, height: number) {
  if (!BUCKET_NAME) throw new Error('BUCKET_NAME environment variable is not defined');
  
  // Use the width and height properties to create the new file name
  const newFileName = `${metadata.filename}-${width}x${height}.${metadata.type.split('/')[1]}`;

  console.log(`New file name for size: ${newFileName}`);

  const s3 = new S3();
  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: newFileName,
    Body: resizedBuffer,
    ContentType: metadata.type,
  }).promise();

  console.log(`Uploaded resized buffer for size to bucket ${BUCKET_NAME}`);

  return `https://s3.amazonaws.com/${BUCKET_NAME}/${newFileName}`;
}

// Helper function to create the event detail object
function createEventDetail(fileUrl: string, metadata: Metadata, thumbnails: Thumbnail[]) {
  const eventDetail: EventDetail = {
    originalImageUrl: fileUrl,
    thumbnails,
    metadata
  };

  console.log("Event envs:", {eventSource: process.env.EVENT_SOURCE, eventDetailType: process.env.EVENT_DETAIL_TYPE})

  console.log(`Created event detail object for thumbnailsGenerated event: ${JSON.stringify(eventDetail)}`);

  return eventDetail;
}

// Helper function to emit the event to EventBridge
async function emitEvent(eventDetail: EventDetail) {
  console.log(`Emitting event with detail object for thumbnailsGenerated event: ${JSON.stringify(eventDetail)}`);

  await eventBridge.putEvents({
    Entries: [{
      Source: process.env.EVENT_SOURCE,
      DetailType: process.env.EVENT_DETAIL_TYPE,
      Detail: JSON.stringify(eventDetail),
      EventBusName: process.env.EVENT_BUS_NAME
    }]
  }).promise();

  console.log(`Sent event to EventBridge with source ${process.env.EVENT_SOURCE} and detail-type ${process.env.EVENT_DETAIL_TYPE}`);
}

async function generateThumbnails(fileUrl: string, metadata: Metadata) {

  console.log(`Generating thumbnails for fileUrl: ${fileUrl} and metadata: ${JSON.stringify(metadata)}`);

  // Get the image buffer from the file URL
  const imageBuffer = await getImageBuffer(fileUrl);

  const thumbnails = [];

  // Use a for...of loop to iterate over image dimensions
  for (const {width, height} of IMAGE_DIMENSIONS) {

    // Resize the image buffer for a given size
    const resizedBuffer = await resizeImageBuffer(imageBuffer, width, height);

    // Upload the resized buffer to S3 and get the URL
    const url = await uploadResizedBuffer(resizedBuffer, metadata, width, height);

    thumbnails.push({
      size: {width, height},
      url
    });
  }

  console.log(`Generated ${thumbnails.length} thumbnails`);

  return thumbnails;
}

export async function handler(event: Event) {
  try {
    const {fileUrl, metadata} = event.detail;

    console.log(`Received event detail: ${JSON.stringify(event.detail)}`);

    const thumbnails = await generateThumbnails(fileUrl, metadata);

    const eventDetail = createEventDetail(fileUrl, metadata, thumbnails);

    await emitEvent(eventDetail);

    return { statusCode: 200, body: 'Thumbnails generated successfully' };
    
  } catch (error) {
    console.error(error);
    
    return { statusCode: 500, body: 'Something went wrong' };
  }
};
