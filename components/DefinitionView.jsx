"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
const Viewport = dynamic(() => import("./Viewport.jsx"), { ssr: false });
const GrasshopperCanvas = dynamic(() => import("./GrasshopperCanvas.jsx"), {
  ssr: false,
});
export default function DefinitionView({
  definition,
  objects = [],
  values,
  onValueChange,
  busy,
  duration,
  initialMode = "split",
}) {
  const [mode, setMode] = useState(initialMode);
  return (
    <section className="view-panel definition-view">
      <div className="definition-toolbar">
        <span className="definition-filename" title={definition?.filename}>
          {definition?.filename || "Untitled exploration"}
        </span>
        <div
          className="definition-modes"
          role="group"
          aria-label="Workspace view"
        >
          {[
            ["geometry", "3D geometry"],
            ["canvas", "Grasshopper"],
            ["split", "Split view"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={`definition-panes mode-${mode}`}>
        <div className="definition-canvas-pane" hidden={mode === "geometry"}>
          <GrasshopperCanvas
            key={definition?.id || "empty"}
            graph={definition?.graph}
            controls={definition?.controls}
            values={values}
            onValueChange={onValueChange}
            disabled={!!busy}
            hasDefinition={!!definition}
          />
        </div>
        <div className="definition-geometry-pane" hidden={mode === "canvas"}>
          <div className="geometry-label">
            <span>03 / GEOMETRY</span>
            <span>
              {duration == null
                ? "LIVE PREVIEW"
                : `${(duration / 1000).toFixed(2)} S / LAST SOLVE`}
            </span>
          </div>
          <Viewport objects={objects} />
        </div>
      </div>
      {busy && (
        <div className="busy" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
    </section>
  );
}
