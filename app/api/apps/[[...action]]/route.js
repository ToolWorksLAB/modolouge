import {
  requireActor,
  originCheck,
  safeError,
  failure,
} from "../../../../lib/auth.js";
import { manager } from "../../../../lib/config.js";
import {
  listApps,
  ownedApp,
  publicDraft,
  restoreDraft,
  saveBlueprint,
  publishApp,
  unpublishApp,
} from "../../../../lib/ai-apps.js";
import { generateApp } from "../../../../lib/ai-builder.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const json = (data) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });
export async function GET(req, { params }) {
  try {
    if (manager) throw failure("Not found.", 404);
    const user = await requireActor(),
      action = (await params).action || [];
    return json(
      action.length
        ? await publicDraft(await ownedApp(user, action[0]))
        : await listApps(user),
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req, { params }) {
  try {
    originCheck(req);
    if (manager) throw failure("Not found.", 404);
    const user = await requireActor();
    const raw = await req.text();
    if (raw.length > 80000) throw failure("Request too large.", 413);
    const body = JSON.parse(raw),
      action = ((await params).action || []).join("/");
    if (action === "generate") return json(await generateApp(user, body, req));
    if (action === "save") return json(await saveBlueprint(user, body));
    if (action === "open") return json(await restoreDraft(user, body.id));
    if (action === "publish") return json(await publishApp(user, body, req));
    if (action === "unpublish")
      return json(await unpublishApp(user, body.id, req));
    throw failure("Not found.", 404);
  } catch (e) {
    return safeError(e);
  }
}
