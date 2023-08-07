import { EventBridgeClient, PutEventsCommand, PutEventsResponse } from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand, PutObjectOutput } from "@aws-sdk/client-s3";
import { parse } from "aws-multipart-parser";
import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";


const eventbridge = new EventBridgeClient({ region: process.env.REGION });
const s3 = new S3Client({ region: process.env.REGION });

const MULTIPART_FORM_DATA = "multipart/form-data";
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

function convertHeaders(event: APIGatewayProxyEvent): { [key: string]: string } {
  const originalHeaders = event.headers;
  const lowercaseHeaders: { [key: string]: string } = {};
  for (let key in originalHeaders) {
    let lowerKey = key.toLowerCase();
    let value = originalHeaders[key];
    if (value !== undefined) {
      lowercaseHeaders[lowerKey] = value;
    }
  }
  return lowercaseHeaders;
}

function validateFile(file: File) {
  if (file.content.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / MB} MB`);
  }

  if (!Object.values(FileType).includes(file.contentType)) {
    throw new Error(`File type ${file.contentType} is not allowed`);
  }

  const pngMagicNumber = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpegMagicNumber = Buffer.from([0xff, 0xd8, 0xff]);

  const fileMagicNumber = file.content.slice(0, 8);

  if (file.contentType === FileType.PNG && !fileMagicNumber.equals(pngMagicNumber)) {
    throw new Error("File content does not match PNG format");
  }
  
  if (file.contentType === FileType.JPEG && !fileMagicNumber.slice(0,3).equals(jpegMagicNumber)) {
    throw new Error("File content does not match JPEG format");
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
  return { response, key };
}

async function publishEvent(key: string, file: File, callbackUrl = ''): Promise<PutEventsResponse> {
  const fileUrl = `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${key}`;
  console.log(`File URL: ${JSON.stringify(fileUrl)}`)
  const event = {
    DetailType: process.env.EVENT_DETAIL_TYPE,
    Source: process.env.EVENT_SOURCE,
    Detail: JSON.stringify({
      ID: key.split('.')[0],
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

  const lowercaseHeaders = convertHeaders(event);

  console.log("Event Body:", event.body)
  console.log("Content-Type:", lowercaseHeaders["content-type"])

  if (!event.body || !lowercaseHeaders["content-type"] || !lowercaseHeaders["content-type"].includes(MULTIPART_FORM_DATA)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request Content-Type. It should be multipart/form-data."
      })
    };
  }

  const formData = parse(event, event.isBase64Encoded);

  console.log("Form data:", formData)

  if (!formData.file || typeof formData.file !== "object") {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing or invalid file object in the form data."
      })
    };
  }

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

    const callbackUrl = lowercaseHeaders["x-callback-url"] || undefined;

    console.log("Uploading file...");
    const { response, key } = await uploadFile(file);
    console.log("Upload response:", response);
    console.log("Upload key:", key);

    console.log("Publishing event...");
    const data = await publishEvent(key, file, callbackUrl);
    console.log("Event data:", data);

    return {
      ...metaData,
      statusCode: 101,
      body: JSON.stringify({
        message: callbackUrl
          ?
          "Image uploaded successfully. It will be processed in the background. A webhook event will be sent after processing is complete."
          :
          `Image uploaded successfully. It will be processed in the background. You can query the image with the ID.`,
        id: key.split('.')[0]
      })
    };
  } catch (error) {
    console.error("Image upload failed:", error);
    return {
      ...metaData,
      statusCode: 500,
      body: JSON.stringify({
        message: `Image upload failed: ${(error as Error).message}`
      })
    };
  }
}

export const handler = async (event: APIGatewayProxyEvent) =>
  await processUploadRequest(event);