import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { agentRequest } from "../lib/client-api.js";
test("agent progress survives fragmented UTF-8 and preserves structured errors", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ event: { message: "Geometry ✓" } }) +
      "\n" +
      JSON.stringify({ app: { revision: 3 } }) +
      "\n",
  );
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
            c.close();
          },
        }),
      ),
  );
  const seen = [];
  assert.equal((await agentRequest({}, (e) => seen.push(e))).revision, 3);
  assert.equal(seen[0].message, "Geometry ✓");
  globalThis.fetch.mock.mockImplementation(
    async () => new Response('{"error":"Verify your email","status":401}\n'),
  );
  await assert.rejects(
    agentRequest({}, () => {}),
    { message: "Verify your email", status: 401 },
  );
  mock.restoreAll();
});
