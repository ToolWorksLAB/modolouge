import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
const cfg = { region: "eu-north-1", maxAttempts: 3 };
export const db = DynamoDBDocumentClient.from(new DynamoDBClient(cfg), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  s3 = new S3Client(cfg),
  sqs = new SQSClient(cfg);
export const table = "modolouge-production",
  bucket = "modolouge-444115534902-eu-north-1",
  queue = "https://sqs.eu-north-1.amazonaws.com/444115534902/modolouge-jobs";
export const get = async (pk, sk = "STATE") =>
  (
    await db.send(
      new GetCommand({
        TableName: table,
        Key: { pk, sk },
        ConsistentRead: true,
      }),
    )
  ).Item;
export const put = (Item) =>
  db.send(new PutCommand({ TableName: table, Item }));
export const update = (
  pk,
  sk,
  UpdateExpression,
  ExpressionAttributeValues,
  extra = {},
) =>
  db.send(
    new UpdateCommand({
      TableName: table,
      Key: { pk, sk },
      UpdateExpression,
      ExpressionAttributeValues,
      ...extra,
    }),
  );
export const download = async (key) => {
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (r.ContentLength > 64 * 1024 * 1024) {
    r.Body.destroy();
    throw new Error("Stored result exceeds size limit.");
  }
  return r.Body.transformToByteArray();
};
export const upload = (Key, data) =>
  s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
      CacheControl: "private, no-store",
    }),
  );
export const transact = (TransactItems) =>
  db.send(new TransactWriteCommand({ TransactItems }));
