import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const dynamodb = new DynamoDBClient({ region: process.env.REGION });

const TABLE_NAME = process.env.TABLE_NAME;

interface Item {
  id: string;
  size: string;
  originalUrl: string;
  thumbnailUrl: string;
  originalFileSize: number;
  type: string;
  callbackUrl: string;
}

interface Response {
  originalImageUrl: string;
  thumbnails: {
    size: {
      width: number;
      height: number;
    };
    url: string;
  }[];
  metadata: {
    fileSize: number;
    type: string;
    filename: string;
  };
}

async function queryData(id: string) {

  console.log("Input id:", id);

  const command = new QueryCommand({
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": { S: id }
    },
    TableName: TABLE_NAME,
  });

  const response = await dynamodb.send(command);
  console.log("Query response:", response);

  console.log(response.Items && response?.Items[0])
  console.log(response.Items && response?.Items[1])
  console.log(response.Items && response?.Items[2])

  if (response.Items && response.Items.length > 0) {

    const items = response.Items.map(item => ({
      id: item.id.S,
      size: item.size.S,
      originalUrl: item.originalUrl.S,
      thumbnailUrl: item.thumbnailUrl.S,
      originalFileSize: Number(item.originalFileSize.N),
      type: item.type.S,
      callbackUrl: item.callbackUrl.S
    })) as Item[];

    console.log("Items:", items);

    const firstItem = items[0];

    const responseObj = {
      originalImageUrl: firstItem.originalUrl,
      thumbnails: items.map(item => ({
        size: {
          width: Number(item.size.split("x")[0]),
          height: Number(item.size.split("x")[1])
        },
        url: item.thumbnailUrl
      })),
      metadata: {
        fileSize: firstItem.originalFileSize,
        type: firstItem.type,
        filename: firstItem.id
      }
    } as Response;

    console.log("Response object:", responseObj);

    return responseObj;

  } else {
    throw new Error(`No items found for id ${id}`);
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      throw new Error("Missing id query parameter");
    }

    console.log("Received id:", id);

    const result = await queryData(id);
    console.log("Result:", result);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
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