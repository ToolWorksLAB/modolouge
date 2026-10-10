import test, { mock } from "node:test";
import assert from "node:assert/strict";
let row,
  blocked = false,
  writes = 0,
  stale = false;
const calls = [];
mock.module("../lib/auth.js", {
  namedExports: {
    failure: (message, status = 400) =>
      Object.assign(new Error(message), { status }),
  },
});
mock.module("../lib/activity.js", {
  namedExports: {
    owns: async (u, id) => u.sk === id,
    person: async () => ({ blocked }),
    activity: async () => {},
    rateLimit: async () => true,
  },
});
mock.module("../lib/aws.js", {
  namedExports: {
    get: async () => null,
    put: async () => {
      writes++;
    },
    s3: {
      send: async () => {
        writes++;
        return {};
      },
    },
    bucket: "test",
  },
});
mock.module("../lib/supabase.js", {
  namedExports: {
    checked: async (promise) => (await promise).data,
    backend: () => ({
      from(table) {
        const q = {
          select() {
            return q;
          },
          eq(key, value) {
            calls.push([table, key, value]);
            return q;
          },
          update() {
            return q;
          },
          upsert(value) {
            writes++;
            return Promise.resolve({ data: value });
          },
          maybeSingle: async () => ({
            data: stale ? null : structuredClone(row),
          }),
        };
        return q;
      },
      storage: {
        from: () => ({
          download: async () => ({ data: new Blob(['{"algo":"private"}']) }),
        }),
      },
    }),
  },
});
const { ownedApp, saveBlueprint, publishedApp, publishApp } =
  await import("../lib/ai-apps.js");
const id = "11111111-1111-4111-8111-111111111111",
  slug = "123456789012345678901234";
const plan = {
  title: "App",
  description: "Description",
  audience: "Audience",
  theme: "paper",
  accent: "pink",
  arrangement: "model",
  confidence: "low",
  reasoning: "private reasoning",
  questions: ["private question"],
  warnings: [],
  steps: [
    {
      id: "step",
      title: "Step",
      description: "Set dimensions",
      evidence: ["node"],
      controls: [{ binding: "radius", label: "Radius", help: "Radius" }],
    },
  ],
};
test("private drafts require ownership and mutations reject stale revisions", async () => {
  row = {
    id,
    owner_id: "owner",
    revision: 1,
    metadata: { controls: [], graph: { nodes: [] } },
  };
  await assert.rejects(ownedApp({ sk: "other" }, id), { status: 404 });
  await assert.rejects(saveBlueprint({ sk: "owner" }, { id, revision: 0 }), {
    status: 409,
  });
  assert.ok(calls.some((c) => c[1] === "id" && c[2] === id));
});
test("guests cannot publish and publishing requires explicit public confirmation", async () => {
  await assert.rejects(publishApp({ kind: "guest" }, {}, null), {
    status: 401,
  });
  row = { id, owner_id: "owner", revision: 1, blueprint: plan };
  await assert.rejects(
    publishApp({ kind: "member", sk: "owner" }, { id, revision: 1 }, null),
    { status: 400 },
  );
  assert.equal(writes, 0);
});
test("public apps omit archives, private graph, owner and AI deliberation", async () => {
  row = {
    slug,
    owner_id: "owner",
    archive_key: "private/file",
    filename: "secret.gh",
    revision: 1,
    blueprint: plan,
    controls: [],
  };
  const result = await publishedApp(slug);
  assert.equal(result.archive_key, undefined);
  assert.equal(result.owner_id, undefined);
  assert.equal(result.blueprint.reasoning, undefined);
  assert.equal(result.blueprint.questions, undefined);
  assert.equal(result.blueprint.steps[0].evidence, undefined);
  blocked = true;
  await assert.rejects(publishedApp(slug), { status: 404 });
  blocked = false;
  stale = true;
  await assert.rejects(publishedApp(slug), { status: 404 });
  stale = false;
  await assert.rejects(publishedApp("../../../private"), { status: 404 });
});
