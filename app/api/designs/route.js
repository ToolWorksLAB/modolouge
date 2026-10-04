import { randomUUID } from "node:crypto";
import {
  requireUser,
  originCheck,
  failure,
  safeError,
} from "../../../lib/auth.js";
import { backend, checked } from "../../../lib/supabase.js";
import { rateLimit, activity } from "../../../lib/activity.js";
import { manager } from "../../../lib/config.js";
import { validateDesign, MAX_DESIGN_BYTES } from "../../../lib/app-design.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (value) =>
  Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
function slotNumber(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20)
    throw failure("Choose a valid saved app slot.");
  return n;
}
export async function GET(req) {
  try {
    if (manager) throw failure("Not found.", 404);
    const u = await requireUser(),
      slot = new URL(req.url).searchParams.get("slot");
    if (slot !== null) {
      const data = await checked(
        backend()
          .from("modolouge_designs")
          .select("slot,revision,document")
          .eq("owner_id", u.id)
          .eq("slot", slotNumber(slot))
          .maybeSingle(),
      );
      if (!data) throw failure("Saved app not found.", 404);
      return response(data);
    }
    const designs = await checked(
      backend()
        .from("modolouge_designs")
        .select("slot,title,definition_name,revision,updated_at")
        .eq("owner_id", u.id)
        .order("updated_at", { ascending: false })
        .limit(20),
    );
    return response({ designs });
  } catch (e) {
    return safeError(e);
  }
}
async function readBody(req) {
  const max = MAX_DESIGN_BYTES + 2000;
  if (Number(req.headers.get("content-length")) > max)
    throw failure("Layout is too large.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw failure("Missing layout.");
  const parts = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw failure("Layout is too large.", 413);
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw failure("Invalid layout JSON.");
  }
}
export async function POST(req) {
  try {
    originCheck(req);
    if (manager) throw failure("Not found.", 404);
    const u = await requireUser();
    if (!(await rateLimit("design:save:" + u.id, 30, 60)))
      throw failure("Please wait a minute before saving again.", 429);
    const body = await readBody(req),
      slot = slotNumber(body.slot);
    if (
      body.revision &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        body.revision,
      )
    )
      throw failure("Invalid saved app revision.");
    let document;
    try {
      document = validateDesign(body.document);
    } catch (e) {
      throw failure(e.message);
    }
    const row = {
      document,
      title: document.title,
      definition_name: document.definitionName,
      revision: randomUUID(),
      updated_at: new Date().toISOString(),
    };
    // Ownership is always obtained from verified Auth, never the submitted layout.
    const query = body.revision
      ? backend()
          .from("modolouge_designs")
          .update(row)
          .eq("owner_id", u.id)
          .eq("slot", slot)
          .eq("revision", body.revision)
      : backend()
          .from("modolouge_designs")
          .insert({ ...row, owner_id: u.id, slot });
    const { data, error } = await query.select("slot,revision").maybeSingle();
    if (error?.code === "23505" || (!error && !data))
      throw failure(
        "This saved app changed in another tab. Reopen it from My saved apps, or export your current layout first.",
        409,
      );
    if (error) await checked(Promise.resolve({ error }));
    // A failed audit must not make a committed save appear to have failed.
    try {
      await activity(u, "app_layout_saved", req, {
        slot,
        elements: document.nodes.length,
      });
    } catch (e) {
      console.error("layout_audit", e.code || e.name);
    }
    return response(data);
  } catch (e) {
    return safeError(e);
  }
}
