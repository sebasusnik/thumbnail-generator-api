import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { EventBridgeEvent } from "aws-lambda";

// Create an instance of DynamoDB client with your region
const dynamodb = new DynamoDBClient({ region: process.env.REGION });

// Get the table name from environment variable
const TABLE_NAME = process.env.TABLE_NAME;

// Define an interface for the image data object
interface Event {
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

// Define an interface for the item object
interface Item {
  id: string;
  size: string;
  originalUrl: string;
  thumbnailUrl: string;
  fileSize: number;
  originalFileSize: number;
  type: string;
}

// Create a function that takes an image data object and returns a promise
async function storeData(data: Event) {

  console.log("Input data:", data);

  // Loop over the thumbnails array and create an item object for each thumbnail
  const items: Item[] = data.thumbnails.map(thumbnail => {

    // Use the original image filename as the id
    const id = data.metadata.filename;

    // Use the width and height properties to create the size attribute
    const size = `${thumbnail.size.width}x${thumbnail.size.height}`;

    // Use destructuring to get other attributes from data object
    const { originalImageUrl, metadata } = data;

    // Return an item object with all attributes
    return {
      id,
      size,
      fileSize: thumbnail.fileSize,
      originalUrl: originalImageUrl,
      thumbnailUrl: thumbnail.url,
      originalFileSize: metadata.fileSize,
      type: metadata.type,
    };
  });

  console.log("Items:", items);

  // Use Promise.all to put all items into DynamoDB table
  await Promise.all(items.map(async item => {

    // Create a PutItemCommand with item object and table name
    const command = new PutItemCommand({
      Item: {
        id: { S: item.id },
        size: { S: item.size },
        fileSize: { N: item.fileSize.toString() },
        originalUrl: { S: item.originalUrl },
        thumbnailUrl: { S: item.thumbnailUrl },
        originalfileSize: { N: item.originalFileSize.toString() },
        type: { S: item.type },
      },
      TableName: TABLE_NAME,
    });

    // Send the command to DynamoDB service and log response
    const response = await dynamodb.send(command);
    console.log("Put response:", response);
  }));

  // Return a success message
  return "Data stored successfully";
}

export async function handler(event: EventBridgeEvent<string, Event>) {
  try {
    // Get the image data object from event detail
    const data = event.detail;

    console.log("Received event detail:", data);

    // Call storeData function with data object and log result
    const result = await storeData(data);
    console.log("Result:", result);

    // Return a response with status code 200 and result message
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: result,
      }),
    };
  } catch (error) {
    // Handle any errors that may occur and log them
    console.error("Something went wrong:", error);

    // Return a response with status code 500 and error message
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Something went wrong: ${(error as Error).message}`,
      }),
    };
  }
}
