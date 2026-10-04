import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { initialDesign } from "../lib/app-design.js";
let actor = { id: "owner-a" },
  calls = [],
  result = { data: { slot: 1, revision: "new-revision" }, error: null };
const failure = (m, status = 400) => Object.assign(new Error(m), { status });
mock.module("../lib/auth.js", {
  namedExports: {
    failure,
    requireUser: async () => {
      if (!actor) throw failure("Sign in", 401);
      return actor;
    },
    originCheck: (req) => {
      if (req.headers.get("origin") !== "https://modolouge.example")
        throw failure("Origin", 403);
    },
    safeError: (e) =>
      Response.json({ error: e.message }, { status: e.status || 500 }),
  },
});
mock.module("../lib/config.js", { namedExports: { manager: false } });
mock.module("../lib/activity.js", {
  namedExports: { rateLimit: async () => true, activity: async () => {} },
});
mock.module("../lib/supabase.js", {
  namedExports: {
    checked: async (p) => {
      const r = await p;
      if (r.error) throw r.error;
      return r.data;
    },
    backend: () => ({
      from: (table) => {
        calls.push(["from", table]);
        const q = {
          then: (resolve, reject) =>
            Promise.resolve(result).then(resolve, reject),
        };
        for (const name of [
          "select",
          "eq",
          "insert",
          "update",
          "order",
          "limit",
          "maybeSingle",
        ])
          q[name] = (...args) => {
            calls.push([name, ...args]);
            return q;
          };
        return q;
      },
    }),
  },
});
const { GET, POST } = await import("../app/api/designs/route.js");
const request = (body, origin = "https://modolouge.example") =>
  new Request("https://modolouge.example/api/designs", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("saved designs require verified account and exact mutation origin", async () => {
  actor = null;
  assert.equal(
    (await GET(new Request("https://modolouge.example/api/designs"))).status,
    401,
  );
  assert.equal((await POST(request({}))).status, 401);
  actor = { id: "owner-a" };
  assert.equal((await POST(request({}, "https://evil.invalid"))).status, 403);
});
test("read and updates always scope to current owner, ignoring submitted ownership", async () => {
  calls = [];
  await GET(new Request("https://modolouge.example/api/designs?slot=1"));
  assert.ok(
    calls.some(
      (x) => x[0] === "eq" && x[1] === "owner_id" && x[2] === "owner-a",
    ),
  );
  calls = [];
  const revision = "00000000-0000-4000-8000-000000000000";
  const r = await POST(
    request({
      slot: 1,
      revision,
      owner_id: "victim",
      document: initialDesign(),
    }),
  );
  assert.equal(r.status, 200);
  assert.ok(
    calls.some(
      (x) => x[0] === "eq" && x[1] === "owner_id" && x[2] === "owner-a",
    ),
  );
  assert.ok(
    calls.some(
      (x) => x[0] === "eq" && x[1] === "revision" && x[2] === revision,
    ),
  );
});
test("new saves use fixed slots and server ownership; stale revisions conflict", async () => {
  calls = [];
  assert.equal(
    (
      await POST(
        request({ slot: 1, document: initialDesign(), owner_id: "victim" }),
      )
    ).status,
    200,
  );
  assert.equal(calls.find((x) => x[0] === "insert")[1].owner_id, "owner-a");
  assert.equal(
    (await POST(request({ slot: 21, document: initialDesign() }))).status,
    400,
  );
  result = { data: null, error: { code: "23505" } };
  assert.equal(
    (await POST(request({ slot: 1, document: initialDesign() }))).status,
    409,
  );
  result = { data: null, error: null };
  assert.equal(
    (
      await POST(
        request({
          slot: 1,
          revision: "00000000-0000-4000-8000-000000000000",
          document: initialDesign(),
        }),
      )
    ).status,
    409,
  );
});
test("oversized actual body is rejected even without content length", async () => {
  assert.equal(
    (await POST(request({ document: "x".repeat(903000) }))).status,
    413,
  );
});
