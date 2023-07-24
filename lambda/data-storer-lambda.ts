// src/my-lambda/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Get the name from the query string parameters
  const name = event.queryStringParameters?.name || 'World';
  console.log(event)

  // Create a greeting message
  const message = `Hello, this is data storer ${name}!`;

  // Return a response with the message
  return {
    statusCode: 200,
    body: JSON.stringify({ message }),
  };
}
