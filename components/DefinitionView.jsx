"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
const Viewport = dynamic(() => import("./Viewport.jsx"), {
  ssr: false,
  loading: () => (
    <div className="notice" role="status">
      Opening the model view…
    </div>
  ),
});
const GrasshopperCanvas = dynamic(() => import("./GrasshopperCanvas.jsx"), {
  ssr: false,
  loading: () => (
    <div className="notice" role="status">
      Opening the Grasshopper canvas…
    </div>
  ),
});
export default function DefinitionView({
  definition,
  objects = [],
  values,
  onValueChange,
  busy,
  duration,
  initialMode = "geometry",
  pendingChanges = 0,
}) {
  const [mode, setMode] = useState(initialMode);
  const [canvasOpened, setCanvasOpened] = useState(initialMode !== "geometry");
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
              onClick={() => {
                if (value !== "geometry") setCanvasOpened(true);
                setMode(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={`definition-panes mode-${mode}`}>
        <div className="definition-canvas-pane" hidden={mode === "geometry"}>
          {canvasOpened && (
            <GrasshopperCanvas
              key={definition?.id || "empty"}
              graph={definition?.graph}
              controls={definition?.controls}
              values={values}
              onValueChange={onValueChange}
              disabled={!!busy}
              hasDefinition={!!definition}
            />
          )}
        </div>
        <div className="definition-geometry-pane" hidden={mode === "canvas"}>
          <div className="geometry-label">
            <span>MODEL</span>
            <span>
              {pendingChanges
                ? "CHANGES NOT YET APPLIED"
                : duration == null
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
