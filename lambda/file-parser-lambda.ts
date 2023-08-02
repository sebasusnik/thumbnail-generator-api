import { EventBridgeClient, PutEventsCommand, PutEventsResponse } from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand, PutObjectOutput } from "@aws-sdk/client-s3";
import { parse } from "aws-multipart-parser";
import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";


const eventbridge = new EventBridgeClient({ region: process.env.REGION });
const s3 = new S3Client({ region: process.env.REGION });

const MB = 1024 * 1024;
const MAX_FILE_SIZE = 11 * MB;

enum FileType {
  PNG = "image/png",
  JPEG = "image/jpeg",
}

interface File {
  type: string;
  filename: string;
  contentType: FileType;
  content: Buffer;
}

function validateFile(file: File) {
  if (file.content.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / MB} MB`);
  }
  if (!Object.values(FileType).includes(file.contentType)) {
    throw new Error(`File type ${file.contentType} is not allowed`);
  }
}

async function uploadFile(file: File): Promise<{ response: PutObjectOutput, key: string }> {
  const key = `${uuidv4()}-${file.filename}`;
  const command = new PutObjectCommand({
    Body: file.content,
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    ContentType: file.contentType,
  });
  const response = await s3.send(command);
  console.log("Upload response:", response);
  console.log("Upload key:", key);
  return { response, key };
}

async function publishEvent(key: string, file: File, callbackUrl: string): Promise<PutEventsResponse> {
  const fileUrl = `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${key}`;
  console.log(`File URL: ${JSON.stringify(fileUrl)}`)
  const event = {
    DetailType: process.env.EVENT_DETAIL_TYPE,
    Source: process.env.EVENT_SOURCE,
    Detail: JSON.stringify({
      callbackUrl,
      fileUrl,
      metadata: {
        fileSize: file.content.byteLength,
        type: file.contentType,
        filename: file.filename.split('.')[0],
      }
    }),
    EventBusName: process.env.EVENT_BUS_NAME,
  };
  const command = new PutEventsCommand({ Entries: [event] });
  const data = await eventbridge.send(command);
  return data;
}

async function processUploadRequest(
event: APIGatewayProxyEvent
): Promise<{ statusCode: number, body: string, headers?: { [key: string]: string | boolean } }> {

  console.log("Input event:", event);

  const formData = parse(event, event.isBase64Encoded);

  console.log("Form data:", formData)
  
  const file = formData.file as File;

  console.log("File data:", file);

  const metaData = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*"
    },
  };

  try {
    validateFile(file);
  } catch (error) {

    console.error("File validation failed:", error);
    return {
      ...metaData,
      statusCode: 400,
      body: JSON.stringify({
        message: `File validation failed: ${(error as Error).message}`
      })
    };
  }

  try {
    const callbackUrl = event.headers["X-Callback-URL".toLowerCase()];
    if (!callbackUrl) {
      throw new Error("Missing X-Callback-URL header");
    }

    console.log("Uploading file...");
    const { response, key } = await uploadFile(file);

    console.log("Publishing event...");
    const data = await publishEvent(key, file, callbackUrl);

    console.log("Event data:", data);

    return {
      ...metaData,
      statusCode: 200,
      body: JSON.stringify({
        message: "Image uploaded successfully. It will be processed in the background and an event will be emitted when done."
      })
    };
  } catch (error) {
    console.error("Image upload failed:", error);
    return {
      ...metaData,
      statusCode: (error as Error).message === "Missing callbackUrl header" ? 400 : 500,
      body: JSON.stringify({
        message: `Image upload failed: ${(error as Error).message}`
      })
    };
  }
}

export const handler = async (event: APIGatewayProxyEvent) =>
  await processUploadRequest(event);
