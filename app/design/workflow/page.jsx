import { notFound } from "next/navigation";
import WorkflowPreview from "../../../components/WorkflowPreview.jsx";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <header className="topbar">
        <a href="/" className="brand">
          toolworkslab<span className="brand-mark">↗</span>
        </a>
        <span className="eyebrow">WORKFLOW PREVIEW</span>
      </header>
      <WorkflowPreview />
    </>
  );
}
