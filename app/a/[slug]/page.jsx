import { notFound } from "next/navigation";
import { publishedApp } from "../../../lib/ai-apps.js";
import PublishedApp from "../../../components/PublishedApp.jsx";
export const dynamic = "force-dynamic";
export default async function Page({ params }) {
  let app;
  try {
    app = await publishedApp((await params).slug);
  } catch (e) {
    if (e.status === 404) notFound();
    throw e;
  }
  return <PublishedApp app={app} />;
}
