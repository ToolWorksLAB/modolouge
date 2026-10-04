import { notFound } from "next/navigation";
import AppDesignerPreview from "../../../components/AppDesignerPreview.jsx";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AppDesignerPreview />;
}
