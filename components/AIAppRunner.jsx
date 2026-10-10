"use client";
import { useState, useId, useRef, useEffect } from "react";
import Viewport from "./Viewport.jsx";
import ConfigurationReview from "./ConfigurationReview.jsx";
import {
  configurationKey,
  confirmConfiguration,
  canConfirmConfiguration,
  foreground,
} from "../lib/app-capabilities.js";

export default function AIAppRunner({
  blueprint,
  definition,
  values,
  onChange,
  objects = [],
  dataOutputs = [],
  onRun,
  busy,
  canRun,
  runHint,
  solvedValues = null,
  revision = 0,
  draftDirty = false,
}) {
  const captureRef = useRef(null);
  const [phase, setPhase] = useState("configure"),
    [confirmation, setConfirmation] = useState(null),
    [preview, setPreview] = useState(null);
  const input = { blueprint, definition, values, revision },
    key = configurationKey(input);
  useEffect(() => {
    setConfirmation(null);
    setPhase("configure");
    setPreview(null);
  }, [key]);
  const ready = canConfirmConfiguration({
    objects,
    values,
    solvedValues,
    busy,
    invalid: draftDirty,
  });
  const confirmed = confirmation?.key === key ? confirmation.snapshot : null;
  const workflow = blueprint.workflow;
  const brand = blueprint.brand;
  const [position, setPosition] = useState(0),
    prefix = useId();
  const index = Math.min(position, blueprint.steps.length - 1),
    step = blueprint.steps[index];
  const controls = new Map(
    definition.controls.map((c) => [c.instanceId || c.name, c]),
  );
  return (
    <section
      className={`ai-runner ai-theme-${blueprint.theme} ai-accent-${blueprint.accent} ai-layout-${blueprint.arrangement}`}
      aria-label={blueprint.title}
      style={
        brand
          ? {
              "--accent": brand.primary,
              "--action-ink": foreground(brand.primary),
              "--app-font":
                brand.font === "mono"
                  ? "monospace"
                  : brand.font === "system"
                    ? "system-ui, sans-serif"
                    : "Poppins, sans-serif",
            }
          : undefined
      }
    >
      <header className="ai-app-heading">
        {blueprint.logo && (
          <img
            className="app-logo-preview"
            src={blueprint.logo}
            alt={brand?.name || "App logo"}
          />
        )}
        <span className="eyebrow">
          {brand?.name || "A PARAMETRIC EXPERIENCE"}
        </span>
        <h2>{blueprint.title}</h2>
        <p>{blueprint.description}</p>
      </header>
      {workflow?.review && (
        <nav className="configuration-nav" aria-label="Configuration journey">
          <button
            aria-current={phase === "configure" ? "step" : undefined}
            onClick={() => setPhase("configure")}
          >
            01 Configure
          </button>
          <button
            aria-current={phase === "review" && !confirmed ? "step" : undefined}
            onClick={() => {
              setPreview(captureRef.current?.() || null);
              setPhase("review");
            }}
          >
            02 Review
          </button>
          {workflow.pdf && (
            <button
              disabled={!confirmed}
              aria-current={
                phase === "review" && confirmed ? "step" : undefined
              }
              onClick={() => setPhase("review")}
            >
              03 Download
            </button>
          )}
        </nav>
      )}
      {phase === "configure" && blueprint.steps.length > 1 && (
        <nav className="ai-steps" aria-label="App steps">
          {blueprint.steps.map((s, i) => (
            <button
              key={s.id}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setPosition(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s.title}
            </button>
          ))}
        </nav>
      )}
      <div className="ai-runner-body" hidden={phase !== "configure"}>
        <div className="ai-inputs">
          <div className="ai-step-heading">
            <span className="eyebrow">
              {String(index + 1).padStart(2, "0")} /{" "}
              {String(blueprint.steps.length).padStart(2, "0")}
            </span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </div>
          <div className="ai-fields">
            {step.controls.map((binding, i) => {
              const c = controls.get(binding.binding);
              if (!c) return null;
              const id = prefix + "-" + i;
              return (
                <div className="ai-field" key={binding.binding}>
                  <label htmlFor={id}>{binding.label}</label>
                  {c.kind === "number" ? (
                    <>
                      <input
                        aria-label={binding.label + " value"}
                        type="number"
                        min={c.min}
                        max={c.max}
                        step={c.step}
                        value={values[c.name] ?? c.value}
                        disabled={!!busy}
                        onChange={(e) => {
                          if (Number.isFinite(e.target.valueAsNumber))
                            onChange(
                              c.name,
                              Math.max(
                                c.min,
                                Math.min(c.max, e.target.valueAsNumber),
                              ),
                            );
                        }}
                      />
                      <input
                        id={id}
                        type="range"
                        min={c.min}
                        max={c.max}
                        step={c.step}
                        value={values[c.name] ?? c.value}
                        disabled={!!busy}
                        onChange={(e) => onChange(c.name, +e.target.value)}
                      />
                      <span className="ai-range">
                        <span>{c.min}</span>
                        <span>{c.max}</span>
                      </span>
                    </>
                  ) : c.kind === "boolean" ? (
                    <input
                      id={id}
                      type="checkbox"
                      checked={values[c.name] ?? c.value}
                      disabled={!!busy}
                      onChange={(e) => onChange(c.name, e.target.checked)}
                    />
                  ) : (
                    <input
                      id={id}
                      type="text"
                      maxLength={2000}
                      value={values[c.name] ?? c.value}
                      disabled={!!busy}
                      onChange={(e) => onChange(c.name, e.target.value)}
                    />
                  )}
                  {binding.help && <small>{binding.help}</small>}
                </div>
              );
            })}
            {!step.controls.length && (
              <p>Explore the model, then continue when you’re ready.</p>
            )}
          </div>
          {blueprint.steps.length > 1 && (
            <div className="ai-step-buttons">
              <button
                className="quiet"
                disabled={index === 0}
                onClick={() => setPosition(index - 1)}
              >
                ← Back
              </button>
              <span>Your values stay with you</span>
              <button
                className="quiet"
                disabled={index === blueprint.steps.length - 1}
                onClick={() => setPosition(index + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
        <div className="ai-model">
          <div className="ai-model-top">
            <span className="eyebrow">LIVE MODEL</span>
            <span>Drag to orbit · scroll to zoom</span>
          </div>
          <Viewport objects={objects} captureRef={captureRef} />
          {!objects.length && !busy && (
            <div className="ai-model-empty">
              Your model starts here.
              <small>Choose your values, then generate the geometry.</small>
            </div>
          )}
          <div className="ai-model-run">
            <div>
              <strong>{busy || runHint || "Ready when you are"}</strong>
              <small>One update applies all steps · one geometry run</small>
            </div>
            <button
              className="button primary"
              disabled={!!busy || !canRun}
              onClick={onRun}
            >
              {busy
                ? "Working…"
                : objects.length
                  ? "Update model ↗"
                  : "Generate model ↗"}
            </button>
          </div>
        </div>
      </div>
      {workflow?.review && phase === "configure" && (
        <div className="configuration-start">
          <p>
            {draftDirty
              ? "Save your app settings before confirming a configuration."
              : "When the model is ready, review the exact values and keep a record."}
          </p>
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() => {
              setPreview(captureRef.current?.() || null);
              setPhase("review");
            }}
          >
            Review configuration →
          </button>
        </div>
      )}
      {phase === "review" && (
        <ConfigurationReview
          key={key}
          input={input}
          ready={ready}
          preview={preview}
          confirmed={confirmed}
          onConfirm={async () => {
            if (!ready) return;
            const snapshot = await confirmConfiguration(input, preview);
            setConfirmation({ key, snapshot });
          }}
          onBack={() => setPhase("configure")}
          pdfEnabled={workflow?.pdf}
        />
      )}
      {dataOutputs.length > 0 && (
        <details className="ai-results">
          <summary>Model results ({dataOutputs.length})</summary>
          <pre>{JSON.stringify(dataOutputs, null, 2).slice(0, 12000)}</pre>
        </details>
      )}
    </section>
  );
}
