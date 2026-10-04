"use client";
import { useState } from "react";
import AppDesigner from "./AppDesigner.jsx";
import fixture from "../tests/fixtures/designer-preview.json";
export default function AppDesignerPreview() {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fixture.controls.map((c) => [c.name, c.value])),
  );
  return (
    <>
      <header className="topbar">
        <a href="/" className="brand">
          toolworkslab <span className="brand-mark">↗</span>
        </a>
        <span className="eyebrow">MOD O LO GUE</span>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">MOD O LO GUE / APPLICATION STUDIO</div>
            <h1>
              From a definition to an experience<span className="pink">.</span>
            </h1>
            <p className="workspace-intro">
              Local design preview. Real saved geometry; controls change values
              without running compute.
            </p>
          </div>
        </div>
        <AppDesigner
          definition={fixture}
          objects={fixture.objects}
          dataOutputs={fixture.dataOutputs}
          values={values}
          onValueChange={(name, v) => setValues((x) => ({ ...x, [name]: v }))}
          canRun={false}
          member={false}
          onSignIn={() => {}}
        />
      </main>
    </>
  );
}
