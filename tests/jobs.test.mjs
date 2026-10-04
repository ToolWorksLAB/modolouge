import test, { mock } from "node:test";
import assert from "node:assert/strict";
let stored;
mock.module("../lib/activity.js", {
  namedExports: {
    owns: async (u, id) => u.sk === id,
    reserveUsage: async () => {},
    refundUsage: async () => {},
    activity: async () => {},
    connection: () => ({ hash: "test" }),
    rateLimit: async () => true,
  },
});
mock.module("../lib/aws.js", {
  namedExports: {
    get: async () => stored,
    put: async () => {},
    update: async () => {},
    transact: async () => {},
    table: "test-table",
    bucket: "test-bucket",
    queue: "test-queue",
    s3: {
      send: async () => {
        throw new Error("Unexpected storage access");
      },
    },
    sqs: {
      send: async () => {
        throw new Error("Unexpected queue access");
      },
    },
  },
});
mock.module("../lib/auth.js", {
  namedExports: {
    failure: (message, status = 400) =>
      Object.assign(new Error(message), { status }),
  },
});
const { readJob, submit, cleanFilename, validId, serviceReady } = await import(
  "../lib/jobs.js"
);
const id = "11111111-1111-4111-8111-111111111111";
test("a user cannot obtain another user’s result URL", async () => {
  stored = { id, owner: "other", status: "done", resultKey: "private/result" };
  await assert.rejects(readJob({ sk: "current" }, id), { status: 404 });
});
test("missing and malformed jobs do not access storage", async () => {
  stored = null;
  await assert.rejects(readJob({ sk: "current" }, id), { status: 404 });
  await assert.rejects(readJob({ sk: "current" }, "../private"), {
    status: 400,
  });
});
test("service shutdown and stale heartbeat reject jobs", async () => {
  stored = { acceptingJobs: false, heartbeat: Date.now() };
  await assert.rejects(serviceReady(), { status: 503 });
  await assert.rejects(
    submit(
      { sk: "current" },
      { type: "example" },
      new Request("https://example.invalid"),
    ),
    { status: 503 },
  );
  stored = { acceptingJobs: true, heartbeat: Date.now() - 100000 };
  await assert.rejects(serviceReady(), { status: 503 });
  stored = { acceptingJobs: true, heartbeat: Date.now() };
  assert.equal((await serviceReady()).acceptingJobs, true);
});
test("file types and identifiers are validated before use", () => {
  assert.throws(() => cleanFilename("test.exe"), { status: 400 });
  assert.throws(() => cleanFilename("a".repeat(130) + ".gh"), { status: 400 });
  assert.equal(cleanFilename("../sphere.gh"), ".._sphere.gh");
  assert.equal(validId(id), id);
});
