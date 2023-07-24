import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
// Import the SQS client and the SendMessageCommand
import { SQS, SendMessageCommand } from '@aws-sdk/client-sqs';
import sharp from 'sharp';
import axios from 'axios';
import { v4 as uuidv4 } from "uuid";

const s3 = new S3Client({});
const sqs = new SQS({});

interface EventDetail {
  fileUrl: string;
  metadata: Metadata;
}

export interface Metadata {
  size: string,
  type: string,
  filename: string,
};

interface Event {
  detail: EventDetail;
}

type SqsMessageParams = {
  QueueUrl: string;
  MessageBody: string;
  DelaySeconds?: number;
  MessageAttributes?: {
    [key: string]: {
      DataType: string;
      StringValue?: string;
      BinaryValue?: Uint8Array;
    };
  };
  MessageDeduplicationId?: string;
  MessageGroupId?: string;
};

async function getImageBuffer(fileUrl: string) {
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const imageBuffer = response.data;
  console.log(["Axios Response:", { response, imageBuffer}])
  return imageBuffer;
}

async function resizeImage(imageBuffer: Buffer, width: number, height: number) {
  const resizedImageBuffer = await sharp(imageBuffer)
    .resize(width, height, { fit: 'cover' }) 
    .toFormat('jpeg')
    .toBuffer();
  console.log(resizedImageBuffer)
  return resizedImageBuffer;
}

async function uploadImage(bucketName: string, resizedImageKey: string, resizedImageBuffer: Buffer) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: resizedImageKey,
      Body: resizedImageBuffer,
      ContentType: 'image/jpeg',
    }));
    console.log("Successfully uploaded image to S3");
  } catch (error) {
    console.error(error);
    throw error;
  }
}

function getImageUrl(bucketName: string, resizedImageKey: string) {
  const resizedImageUrl = `https://${bucketName}.s3.amazonaws.com/${resizedImageKey}`;
  return resizedImageUrl;
}

function createMessage(width: number, height: number, queueUrl: string, messageGroupId: string, fileUrl: string, resizedImageUrl: string, metadata: Metadata) {

  const params: SqsMessageParams = {
    MessageBody: JSON.stringify({
      original: fileUrl,
      url: resizedImageUrl,
      size: {
        width,
        height
      },
      metadata: metadata
    }),
    MessageDeduplicationId: metadata.filename,  // Required for FIFO queues
    MessageGroupId: messageGroupId,  // Required for FIFO queues
    QueueUrl: queueUrl // Use the queue URL from the environment variable
  };
  console.log("SQS Message Params", {params})
  return params;
}

async function sendMessage(sqs: SQS, params: SqsMessageParams) {
  const data = await sqs.send(new SendMessageCommand(params));
  console.log("Successfully sent message to SQS queue", data);
}

async function coreLogic(event: Event) {

  const { fileUrl, metadata } = event.detail;

  const bucketName = process.env.BUCKET_NAME || "";
  const width = parseInt(process.env.WIDTH || "");
  const height = parseInt(process.env.HEIGHT || "");
  const queueUrl = process.env.QUEUE_URL || "";
  const messageGroupId = process.env.MESSAGE_GROUP || "";

  console.log({envs: {bucketName, width, height, queueUrl, messageGroupId}})

  const resizedImageId = `${width}x${height}-${uuidv4()}`;
  console.log(resizedImageId)

  const resizedImageKey = `resized/${resizedImageId}.jpg`;
  console.log(resizedImageKey)

  const imageBuffer = await getImageBuffer(fileUrl);
  const resizedImageBuffer = await resizeImage(imageBuffer, width, height);

  await uploadImage(bucketName, resizedImageKey, resizedImageBuffer);

  const resizedImageUrl = getImageUrl(bucketName, resizedImageKey);
  const messageParams = createMessage(width, height, queueUrl, messageGroupId, fileUrl, resizedImageUrl, metadata);

  await sendMessage(sqs, messageParams);
}

export const handler = async (event: Event) => {
    await coreLogic(event);
};
