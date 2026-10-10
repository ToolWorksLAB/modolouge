import { notFound } from "next/navigation";
import AIStudioPreview from "../../../components/AIStudioPreview.jsx";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AIStudioPreview />;
}
