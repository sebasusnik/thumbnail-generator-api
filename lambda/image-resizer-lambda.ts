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
  originalUrl: string;
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

const generateThumbnails = async (fileUrl: string, metadata: Metadata) => {

  if (!BUCKET_NAME) throw new Error('BUCKET_NAME environment variable is not defined');

  console.log(`Generating thumbnails for fileUrl: ${fileUrl} and metadata: ${JSON.stringify(metadata)}`);

  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(response.data, 'binary');

  console.log(`Image buffer size: ${imageBuffer.length} bytes`);

  const thumbnails = [];

  // Use a for...of loop to iterate over image dimensions
  for (const {width, height} of IMAGE_DIMENSIONS) {

    console.log(`Resizing image for size: ${JSON.stringify({width, height})}`);

    const resizedBuffer = await sharp(imageBuffer)
      .resize(width, height)
      .toBuffer();

    console.log(`Resized buffer size for size: ${resizedBuffer.length} bytes`);

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

    thumbnails.push({
      size: {width, height},
      url: `https://s3.amazonaws.com/${BUCKET_NAME}/${newFileName}`
    });
  }

  console.log(`Generated ${thumbnails.length} thumbnails`);

  return thumbnails;
};

export const handler = async (event: Event) => {
  try {
    const {fileUrl, metadata} = event.detail;

    console.log(`Received event detail: ${JSON.stringify(event.detail)}`);

    const thumbnails = await generateThumbnails(fileUrl, metadata);

    const eventDetail: EventDetail = {
      originalUrl: fileUrl,
      thumbnails,
      metadata
    };

    console.log("Event envs:", {eventSource: process.env.EVENT_SOURCE, eventDetailType: process.env.EVENT_DETAIL_TYPE})

    console.log(`Created event detail object for thumbnailsGenerated event: ${JSON.stringify(eventDetail)}`);

    await eventBridge.putEvents({
      Entries: [{
        Source: process.env.EVENT_SOURCE,
        DetailType: process.env.EVENT_DETAIL_TYPE,
        Detail: JSON.stringify(eventDetail),
        EventBusName: process.env.EVENT_BUS_NAME
      }]
    }).promise();
    
    console.log(`Sent event to EventBridge with source ${process.env.EVENT_SOURCE} and detail-type ${process.env.EVENT_DETAIL_TYPE}`);

    return { statusCode: 200, body: 'Thumbnails generated successfully' };
    
  } catch (error) {
    console.error(error);
    
    return { statusCode: 500, body: 'Something went wrong' };
  }
};
