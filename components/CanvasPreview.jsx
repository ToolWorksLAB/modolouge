"use client";
import { useState } from "react";
import DefinitionView from "./DefinitionView.jsx";
import fixture from "../tests/fixtures/canvas-preview.json";
export default function CanvasPreview() {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fixture.controls.map((c) => [c.name, c.value])),
  );
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          toolworkslab <span className="brand-mark">↗</span>
        </a>
        <span className="eyebrow">MOD O LO GUE</span>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">MOD O LO GUE / CANVAS STUDY</div>
            <h1>
              See how your idea connects<span className="pink">.</span>
            </h1>
            <p className="workspace-intro">
              Real Grasshopper archive and Rhino Compute result. Local design
              preview; geometry is a saved snapshot.
            </p>
          </div>
        </div>
        <div className="studio">
          <aside className="control-panel">
            <div className="panel-heading">
              <span className="eyebrow">01 / DEFINITION</span>
              <span>.GHX</span>
            </div>
            <div className="file-chip">
              <span>◈</span>
              <div>
                <strong>{fixture.filename}</strong>
                <small>3 exposed controls · 4 components</small>
              </div>
            </div>
            <div className="panel-heading parameters-title">
              <span className="eyebrow">02 / PARAMETERS</span>
            </div>
            <div className="parameters">
              {fixture.controls.map((c) => (
                <div key={c.name} className="parameter">
                  <label htmlFor={c.name}>{c.label}</label>
                  <input
                    aria-label={c.label + " value"}
                    type="number"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={values[c.name]}
                    onChange={(e) => {
                      if (Number.isFinite(e.target.valueAsNumber))
                        setValues({
                          ...values,
                          [c.name]: Math.max(
                            c.min,
                            Math.min(c.max, e.target.valueAsNumber),
                          ),
                        });
                    }}
                  />
                  <input
                    id={c.name}
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={values[c.name]}
                    onChange={(e) =>
                      setValues({ ...values, [c.name]: +e.target.value })
                    }
                  />
                  <div className="range-ends">
                    <span>{c.min}</span>
                    <span>{c.max}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="fine">
              Inspect a component to follow its connections. Slider values stay
              in sync between the canvas and the controls.
            </p>
          </aside>
          <DefinitionView
            definition={fixture}
            objects={fixture.objects}
            values={values}
            onValueChange={(name, value) =>
              setValues((v) => ({ ...v, [name]: value }))
            }
          />
        </div>
      </main>
    </>
  );
}
