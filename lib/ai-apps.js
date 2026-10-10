import { randomBytes, createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { get, put, s3, bucket } from "./aws.js";
import { backend, checked } from "./supabase.js";
import { failure } from "./auth.js";
import { owns, person, rateLimit, activity } from "./activity.js";
import { validateBlueprint, graphContext } from "./ai-blueprint.js";

const storage = () => backend().storage.from("modolouge-apps");
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fields = "id,filename,blueprint,revision,created_at,updated_at";
export async function ownedApp(user, id) {
  if (!uuid.test(id || "")) throw failure("App not found.", 404);
  const app = await checked(
    backend().from("modolouge_apps").select("*").eq("id", id).maybeSingle(),
  );
  if (!app || !(await owns(user, app.owner_id)))
    throw failure("App not found.", 404);
  return app;
}
export async function publicDraft(app) {
  const publication = await checked(
    backend()
      .from("modolouge_publications")
      .select("slug,active,revision")
      .eq("app_id", app.id)
      .maybeSingle(),
  );
  return {
    id: app.id,
    filename: app.filename,
    blueprint: app.blueprint,
    revision: app.revision,
    conversation: app.conversation || [],
    definition: {
      ...app.metadata,
      id: app.definition_id,
      filename: app.filename,
    },
    publication,
  };
}
export async function listApps(user) {
  const linked = await checked(
    backend()
      .from("modolouge_people")
      .select("id")
      .eq("linked_to", user.sk)
      .eq("blocked", false),
  );
  return checked(
    backend()
      .from("modolouge_apps")
      .select(fields)
      .in("owner_id", [user.sk, ...linked.map((p) => p.id)])
      .order("updated_at", { ascending: false })
      .limit(60),
  );
}
export async function captureApp(user, definitionId) {
  if (!uuid.test(definitionId || ""))
    throw failure("Choose a prepared Grasshopper file.");
  if (!(await rateLimit("ai:capture:" + user.sk, 10, 60)))
    throw failure("Please wait before opening another file.", 429);
  const def = await get("DEF#" + definitionId);
  if (
    !def ||
    !(await owns(user, def.owner)) ||
    def.status !== "ready" ||
    def.ttl < Date.now() / 1000
  )
    throw failure("This file expired. Upload it again.", 404);
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: def.preparedKey }),
  );
  if (result.ContentLength > 41943040)
    throw failure("This prepared file is too large to save as an app.", 413);
  const bytes = await result.Body.transformToByteArray();
  if (bytes.length > 41943040)
    throw failure("This prepared file is too large to save as an app.", 413);
  const archive = JSON.parse(new TextDecoder().decode(bytes));
  const metadata = {
    controls: archive.controls,
    graph: archive.graph,
    warnings: archive.warnings || [],
  };
  graphContext(metadata); // Bound the model input before retaining a new draft.
  const app = await checked(
    backend().rpc("modolouge_create_ai_app", {
      p_owner: user.sk,
      p_definition: definitionId,
      p_filename: def.filename,
      p_metadata: metadata,
    }),
  );
  const { error } = await storage().upload(app.archive_key, bytes, {
    contentType: "application/json",
    upsert: true,
  });
  if (error)
    throw failure("The app archive could not be saved. Please retry.", 503);
  return app;
}
export async function saveBlueprint(user, body) {
  const app = await ownedApp(user, body.id);
  if (!Number.isInteger(body.revision) || body.revision !== app.revision)
    throw failure(
      "This draft changed elsewhere. Reopen it before saving.",
      409,
    );
  let blueprint;
  try {
    blueprint = validateBlueprint(body.blueprint, app.metadata);
  } catch {
    throw failure("The app layout contains invalid steps or input bindings.");
  }
  const updated = await checked(
    backend()
      .from("modolouge_apps")
      .update({
        blueprint,
        revision: app.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", app.id)
      .eq("revision", app.revision)
      .select("*")
      .maybeSingle(),
  );
  if (!updated)
    throw failure(
      "This draft changed elsewhere. Reopen it before saving.",
      409,
    );
  return publicDraft(updated);
}
async function restoreArchive(app, owner) {
  const { data, error } = await storage().download(app.archive_key);
  if (error)
    throw failure(
      "The saved definition is unavailable. Please contact the app owner.",
      503,
    );
  const bytes = new Uint8Array(await data.arrayBuffer());
  // A published snapshot and a newer draft must never share a mutable runtime.
  const hash = createHash("sha256")
    .update(owner + "/" + app.archive_key)
    .digest("hex");
  const runtimeId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const key = `uploads/${owner}/${runtimeId}/app-runtime.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: "application/json",
    }),
  );
  await put({
    pk: "DEF#" + runtimeId,
    sk: "STATE",
    id: runtimeId,
    owner,
    filename: app.filename,
    status: "ready",
    preparedKey: key,
    ttl: Math.floor(Date.now() / 1000) + 86400,
  });
  return { id: runtimeId, owner };
}
export async function restoreDraft(user, id) {
  const app = await ownedApp(user, id);
  if (!(await rateLimit("ai:restore:" + user.sk, 10, 60)))
    throw failure("Please wait before reopening another app.", 429);
  const def = await restoreArchive(app, app.owner_id);
  return {
    ...(await publicDraft(app)),
    definition: { ...app.metadata, id: def.id, filename: app.filename },
  };
}
export async function publishApp(user, body, req) {
  if (user.kind !== "member")
    throw failure("Verify your email before publishing.", 401);
  const app = await ownedApp(user, body.id);
  if (!app.blueprint || body.revision !== app.revision)
    throw failure("Save and review the latest draft before publishing.", 409);
  if (body.confirmPublic !== true)
    throw failure(
      "Confirm that this app and its outputs can be shared publicly.",
    );
  const blueprint = validateBlueprint(app.blueprint, app.metadata);
  // Read the archive now: never publish a link to a missing temporary upload.
  await restoreArchive(app, app.owner_id);
  const prior = await checked(
    backend()
      .from("modolouge_publications")
      .select("slug")
      .eq("app_id", app.id)
      .maybeSingle(),
  );
  const publication = {
    slug: prior?.slug || randomBytes(12).toString("hex"),
    app_id: app.id,
    owner_id: user.sk,
    runtime_owner_id: app.owner_id,
    revision: app.revision,
    blueprint,
    controls: app.metadata.controls,
    archive_key: app.archive_key,
    filename: app.filename,
    active: true,
    published_at: new Date().toISOString(),
  };
  await checked(
    backend()
      .from("modolouge_publications")
      .upsert(publication, { onConflict: "app_id" }),
  );
  await activity(user, "app_published", req, {
    appId: app.id,
    revision: app.revision,
  });
  return { slug: publication.slug, active: true, revision: app.revision };
}
export async function unpublishApp(user, id, req) {
  const app = await ownedApp(user, id);
  await checked(
    backend()
      .from("modolouge_publications")
      .update({ active: false })
      .eq("app_id", app.id),
  );
  await activity(user, "app_unpublished", req, { appId: id });
  return { ok: true };
}
async function publication(slug) {
  if (!/^[a-f0-9]{24}$/.test(slug || "")) throw failure("App not found.", 404);
  const p = await checked(
    backend()
      .from("modolouge_publications")
      .select("*")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle(),
  );
  const owner = p ? await person(p.owner_id) : null;
  if (!p || !owner || owner.blocked)
    throw failure("This app is unavailable.", 404);
  return p;
}
export async function publishedApp(slug) {
  const p = await publication(slug);
  // No graph, archive, brief, model rationale or owner identity leaves this route.
  const { title, description, theme, accent, arrangement, steps } = p.blueprint;
  return {
    slug,
    revision: p.revision,
    blueprint: {
      title,
      description,
      theme,
      accent,
      arrangement,
      steps: steps.map(({ evidence, ...s }) => s),
    },
    definition: { controls: p.controls },
  };
}
export async function publishedDefinition(user, slug) {
  const p = await publication(slug);
  if (!(await rateLimit("published:run:" + slug, 60, 86400)))
    throw failure("This app has reached today's 60-run allowance.", 429);
  const runtime = await restoreArchive(
    { id: p.app_id, archive_key: p.archive_key, filename: p.filename },
    p.runtime_owner_id,
  );
  return { id: runtime.id, owner: p.runtime_owner_id, publicationSlug: p.slug };
}

export async function retainCandidate(user, app, definitionId) {
  const def = await get("DEF#" + definitionId);
  if (
    !def ||
    def.owner !== user.sk ||
    def.status !== "ready" ||
    def.ttl < Date.now() / 1000
  )
    throw failure("Tested candidate expired.", 409);
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: def.preparedKey }),
  );
  if (result.ContentLength > 41943040)
    throw failure("Candidate archive is too large.", 413);
  const bytes = await result.Body.transformToByteArray();
  if (bytes.length > 41943040)
    throw failure("Candidate archive is too large.", 413);
  const archive = JSON.parse(new TextDecoder().decode(bytes));
  const metadata = {
    controls: archive.controls,
    graph: archive.graph,
    warnings: archive.warnings || [],
  };
  graphContext(metadata);
  const archive_key = `${app.owner_id}/${app.id}/${definitionId}.json`;
  const { error } = await storage().upload(archive_key, bytes, {
    contentType: "application/json",
    upsert: false,
  });
  if (error) throw failure("The tested revision could not be saved.", 503);
  return { archive_key, metadata, definition_id: definitionId };
}
export async function appVersions(user, id) {
  await ownedApp(user, id);
  return checked(
    backend()
      .from("modolouge_app_versions")
      .select("revision,created_at")
      .eq("app_id", id)
      .order("revision", { ascending: false })
      .limit(30),
  );
}
export async function restoreVersion(user, body) {
  const app = await ownedApp(user, body.id);
  if (body.revision !== app.revision || !Number.isInteger(body.targetRevision))
    throw failure("Reopen the latest draft before restoring.", 409);
  const v = await checked(
    backend()
      .from("modolouge_app_versions")
      .select("*")
      .eq("app_id", app.id)
      .eq("revision", body.targetRevision)
      .maybeSingle(),
  );
  if (!v) throw failure("Version not found.", 404);
  const { definition_id, archive_key, metadata, blueprint, conversation } = v;
  const updated = await checked(
    backend()
      .from("modolouge_apps")
      .update({
        definition_id,
        archive_key,
        metadata,
        blueprint,
        conversation,
        revision: app.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", app.id)
      .eq("revision", app.revision)
      .select("*")
      .maybeSingle(),
  );
  if (!updated)
    throw failure("The draft changed. Reopen it before restoring.", 409);
  return restoreDraft(user, app.id);
}
