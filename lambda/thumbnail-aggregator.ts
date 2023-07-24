import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SQSEvent } from 'aws-lambda';
import { Metadata } from './image-resizer-lambda';

const events = new EventBridgeClient({});

interface Thumbnail {
  originalImageUrl: string;
  size: Size;
  url: string;
  metadata: Metadata;
}

interface Size {
  width: number;
  height: number;
}

async function aggregateThumbnails(event: SQSEvent) {
  const eventBusName = process.env.EVENT_BUS_NAME;
  const eventSource = process.env.EVENT_SOURCE;
  const eventDetailType = process.env.EVENT_DETAIL_TYPE;

  console.log("Envs:", {eventBusName, eventSource, eventDetailType} )

  let thumbnails: Thumbnail[] = [];

  for (const record of event.Records) {
    const body = record.body;
    console.log("Body:", body)
    const detail = JSON.parse(body);
    console.log("Detail:", detail)
    thumbnails.push(detail);
  }

  console.log("Thumbnails:", {thumbnails})
  thumbnails.sort((a, b) => a.size.width - b.size.width);

  // Modify the eventDetail object to match the desired structure
  const eventDetail = {
    originalUrl: thumbnails[0].originalImageUrl,
    thumbnails: [
      {
        size: thumbnails[0].size,
        url: thumbnails[0].url
      },
      {
        size: thumbnails[1].size,
        url: thumbnails[1].url
      },
      {
        size: thumbnails[2].size,
        url: thumbnails[2].url
      }
    ],
    metadata: thumbnails[0].metadata
  };

  console.log(`Event detail object: ${JSON.stringify(eventDetail)}`);

  await events.send(new PutEventsCommand({
    Entries: [
      {
        Source: eventSource,
        DetailType: eventDetailType,
        Detail: JSON.stringify(eventDetail),
        EventBusName: eventBusName,
      },
    ],
  }));

  console.log('Event emitted successfully');
}

export const handler = async (event: SQSEvent) => {
  console.log({event})
  await aggregateThumbnails(event);
};
