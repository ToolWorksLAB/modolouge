import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { db, table } from "./storage.js";
let lastPrune = 0;
export async function flushTelemetry() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return;
  const headers = {
    apikey: process.env.SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const result = await db.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "pk=:pk",
      ExpressionAttributeValues: { ":pk": "SUPABASE_OUTBOX" },
      Limit: 50,
    }),
  );
  for (const item of result.Items || []) {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/modolouge_compute_usage?id=eq.${encodeURIComponent(item.id)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: item.status,
          seconds: item.seconds,
          finished_at: item.finishedAt,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Telemetry delivery failed");
    await db.send(
      new DeleteCommand({
        TableName: table,
        Key: { pk: item.pk, sk: item.sk },
      }),
    );
  }
  if (Date.now() - lastPrune > 86400000) {
    const response = await fetch(
      process.env.SUPABASE_URL + "/rest/v1/rpc/modolouge_prune_activity",
      {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (response.ok) lastPrune = Date.now();
  }
}
