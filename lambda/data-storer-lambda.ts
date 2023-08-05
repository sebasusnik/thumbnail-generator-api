import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { EventBridgeEvent } from "aws-lambda";

const dynamodb = new DynamoDBClient({ region: process.env.REGION });

const TABLE_NAME = process.env.TABLE_NAME;

interface Event {
  ID: string;
  callbackUrl: string;
  originalImageUrl: string;
  thumbnails: {
    size: {
      width: number;
      height: number;
    };
    fileSize: number;
    url: string;
  }[];
  metadata: {
    fileSize: number;
    type: string;
    filename: string;
  };
}

interface Item {
  id: string;
  size: string;
  originalUrl: string;
  thumbnailUrl: string;
  fileSize: number;
  originalFileSize: number;
  type: string;
  callbackUrl: string;
}

async function storeData(data: Event) {

  console.log("Input data:", data);

  const items: Item[] = data.thumbnails.map(thumbnail => {

    const id = data.ID;

    const size = `${thumbnail.size.width}x${thumbnail.size.height}`;

    const { originalImageUrl, metadata } = data;

    return {
      id,
      size,
      fileSize: thumbnail.fileSize,
      originalUrl: originalImageUrl,
      thumbnailUrl: thumbnail.url,
      originalFileSize: metadata.fileSize,
      type: metadata.type,
      callbackUrl: data.callbackUrl
    };
  });

  console.log("Items:", items);

  await Promise.all(items.map(async item => {

    const command = new PutItemCommand({
      Item: {
        id: { S: item.id },
        size: { S: item.size },
        fileSize: { N: item.fileSize.toString() },
        originalUrl: { S: item.originalUrl },
        thumbnailUrl: { S: item.thumbnailUrl },
        originalFileSize: { N: item.originalFileSize.toString() },
        type: { S: item.type },
        callbackUrl: { S: item.callbackUrl }
      },
      TableName: TABLE_NAME,
    });

    const response = await dynamodb.send(command);
    console.log("Put response:", response);
  }));

  return "Data stored successfully";
}

export async function handler(event: EventBridgeEvent<string, Event>) {
  try {
    const data = event.detail;

    console.log("Received event detail:", data);

    const result = await storeData(data);
    console.log("Result:", result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: result,
      }),
    };
  } catch (error) {
    console.error("Something went wrong:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Something went wrong: ${(error as Error).message}`,
      }),
    };
  }
}