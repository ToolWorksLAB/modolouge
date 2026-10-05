"use client";
import { useRef, useState } from "react";
import Workspace from "./Workspace.jsx";
import fixture from "../tests/fixtures/designer-preview.json";
import { initialDesign, validateDesign } from "../lib/app-design.js";
export default function WorkflowPreview() {
  const records = useRef(
    new Map([
      [
        1,
        {
          document: { ...initialDesign(fixture), title: "Saved sphere layout" },
          revision: "preview-original",
        },
      ],
    ]),
  );
  const [calls, setCalls] = useState({ saves: 0, reads: 0 });
  async function request(path, body) {
    if (body) {
      const current = records.current.get(body.slot);
      if (current && current.revision !== body.revision)
        throw new Error("Preview revision conflict");
      const revision = crypto.randomUUID();
      records.current.set(body.slot, {
        document: validateDesign(body.document),
        revision,
      });
      setCalls((c) => ({ ...c, saves: c.saves + 1 }));
      return { slot: body.slot, revision };
    }
    setCalls((c) => ({ ...c, reads: c.reads + 1 }));
    if (path.startsWith("designs?slot="))
      return structuredClone(records.current.get(Number(path.split("=")[1])));
    return {
      designs: [...records.current].map(([slot, d]) => ({
        slot,
        title: d.document.title,
        definition_name: d.document.definitionName,
        updated_at: "2026-10-05T00:00:00Z",
      })),
    };
  }
  return (
    <>
      <div className="notice" role="status">
        Isolated workflow test · simulated accounts and storage · {calls.saves}{" "}
        saves / {calls.reads} reads · no live service calls
      </div>
      <Workspace previewFixture={fixture} previewDesignRequest={request} />
    </>
  );
}
