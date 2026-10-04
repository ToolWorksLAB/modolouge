// Explicit integration test. Creates and removes only its own disposable users.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { EncryptJWT } from "jose";
import { createClient } from "@supabase/supabase-js";
import { initialDesign } from "../lib/app-design.js";
if (process.env.MODOLOUGE_DESIGN_TEST !== "1")
  throw new Error("Set MODOLOUGE_DESIGN_TEST=1 for this live test.");
const base = process.argv[2] || process.env.APP_URL,
  options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  options,
);
const checked = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const fixtures = [];
async function actor() {
  const email = `design-test-${randomUUID()}@example.invalid`,
    password = randomUUID() + randomUUID();
  const user = checked(
    await server.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
  ).user;
  const fixture = { id: user.id };
  fixtures.push(fixture);
  checked(
    await server.rpc("modolouge_link_account", {
      p_auth_id: user.id,
      p_guest: null,
    }),
  );
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  const s = checked(
    await client.auth.signInWithPassword({ email, password }),
  ).session;
  fixture.access = s.access_token;
  const cookie = await new EncryptJWT({
    sub: user.id,
    email,
    access: s.access_token,
    refresh: s.refresh_token,
    expires: s.expires_at,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .encrypt(createHash("sha256").update(process.env.SESSION_SECRET).digest());
  const cookieName =
    (base.startsWith("http://localhost") ? "" : "__Host-") + "modolouge-v2";
  return {
    client,
    request: async (path = "", body) => {
      const r = await fetch(base + "/api/designs" + path, {
        method: body ? "POST" : "GET",
        headers: {
          cookie: cookieName + "=" + cookie,
          origin: new URL(base).origin,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    },
  };
}
try {
  const a = await actor(),
    b = await actor(),
    document = initialDesign({
      filename: "integration-test.ghx",
      controls: [],
    });
  const saved = await a.request("", { slot: 1, document });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const own = await a.request("?slot=1");
  assert.equal(own.status, 200);
  assert.equal(own.data.document.title, document.title);
  assert.equal((await b.request("?slot=1")).status, 404);
  assert.equal(
    (await b.request("", { slot: 1, document, revision: saved.data.revision }))
      .status,
    409,
  );
  document.title = "Updated layout";
  const updated = await a.request("", {
    slot: 1,
    document,
    revision: saved.data.revision,
  });
  assert.equal(updated.status, 200);
  assert.equal(
    (await a.request("", { slot: 1, document, revision: saved.data.revision }))
      .status,
    409,
  );
  const publicClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  assert.equal(
    (await publicClient.from("modolouge_designs").select("*")).error.code,
    "42501",
  );
  assert.equal(
    (await a.client.from("modolouge_designs").select("*")).error.code,
    "42501",
  );
  assert.equal((await fetch(base + "/api/designs")).status, 401);
  console.log(
    JSON.stringify({
      accountSave: "passed",
      load: "passed",
      update: "passed",
      otherAccount: "denied",
      staleOverwrite: "denied",
      anonymousAPI: "denied",
      directDatabase: "denied",
    }),
  );
} finally {
  for (const f of fixtures) {
    if (f.access) checked(await server.auth.admin.signOut(f.access, "global"));
    checked(
      await server.from("modolouge_activity").delete().eq("actor_id", f.id),
    );
    checked(
      await server
        .from("modolouge_limits")
        .delete()
        .eq("key", "design:save:" + f.id),
    );
    checked(await server.from("modolouge_people").delete().eq("id", f.id));
    checked(await server.auth.admin.deleteUser(f.id));
  }
  console.log("Disposable design test accounts and their layouts removed.");
}
