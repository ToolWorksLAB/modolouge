import { notFound } from "next/navigation";
import CanvasPreview from "../../../components/CanvasPreview.jsx";
export default function DesignPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CanvasPreview />;
}
