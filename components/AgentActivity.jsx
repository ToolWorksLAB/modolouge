"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { activityMessage } from "../lib/agent-activity.js";
const Canvas = dynamic(() => import("./GrasshopperCanvas.jsx"), { ssr: false });
const phases = [
  ["read", "Read"],
  ["plan", "Plan"],
  ["test", "Test"],
  ["design", "Design"],
  ["save", "Save"],
];
export default function AgentActivity({
  definition,
  events = [],
  pending,
  error,
}) {
  const [expanded, setExpanded] = useState(!!pending),
    [follow, setFollow] = useState(true),
    [seconds, setSeconds] = useState(0),
    [chosen, setChosen] = useState(null);
  const started = useRef(null),
    root = useRef(null),
    wasPending = useRef(false);
  useEffect(() => {
    if (!pending) {
      wasPending.current = false;
      return;
    }
    started.current = Date.now();
    setSeconds(0);
    setExpanded(true);
    setChosen(null);
    if (!wasPending.current)
      root.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "nearest",
      });
    wasPending.current = true;
    const t = setInterval(
      () => setSeconds(Math.floor((Date.now() - started.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [pending]);
  const latest =
    events.findLast((e) => e.status === "running") || events.at(-1);
  const visible = events.filter((e) => e.tool !== "model_step");
  const active =
    chosen === null
      ? events.findLast((e) => e.nodeIds?.length) || latest
      : visible[chosen];
  const graph = events.findLast((e) => e.graph)?.graph || definition?.graph;
  const highlights = useMemo(() => active?.nodeIds || [], [active]);
  const actions = events.findLast((e) => e.actions)?.actions;
  const completed = events.some(
    (e) => e.tool === "save_app" && e.status === "passed",
  );
  const title = pending
    ? "Your idea, taking shape."
    : error
      ? "This attempt needs attention."
      : completed
        ? "Ready for your next move."
        : "Inside the definition";
  return (
    <section
      className={`agent-live ${pending ? "is-building" : ""}`}
      ref={root}
      aria-label="Live build activity"
    >
      <header>
        <div>
          <span className="eyebrow">
            <i className="agent-live-dot" />{" "}
            {pending ? "LIVE BUILD" : "BUILD CANVAS"}
            {pending ? ` / ${seconds}s` : ""}
          </span>
          <h3>{title}</h3>
        </div>
        <button
          className="quiet"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : "Show canvas"} {expanded ? "−" : "+"}
        </button>
      </header>
      <div className="agent-phase-strip" aria-label="Build stages">
        {phases.map(([phase, label]) => {
          const entries = events.filter((e) => e.phase === phase);
          const state =
            pending && latest?.phase === phase
              ? "active"
              : entries.some((e) => e.status === "passed")
                ? "done"
                : "waiting";
          return (
            <span key={phase} className={state}>
              {state === "done" ? "✓" : state === "active" ? "●" : "○"} {label}
            </span>
          );
        })}
      </div>
      <p className="agent-now" role="status">
        {error
          ? "The saved draft is intact. Review the last result below and try a focused correction."
          : pending
            ? activityMessage(
                latest || { message: "Connecting to your build partner…" },
              )
            : completed
              ? "Tested changes are saved. Explore the model or keep the conversation going."
              : "Explore the graph. During a build, the components being inspected or changed light up here."}
      </p>
      {expanded && (
        <div className="agent-live-body">
          <div className="agent-graph">
            <div className="agent-canvas-label">
              <span>
                {active?.tool === "test_definition"
                  ? active.status === "passed"
                    ? "✓ TESTED CANDIDATE"
                    : active.status === "failed"
                      ? "PREVIOUS WORKING GRAPH"
                      : "PROPOSED EDITS · TEST IN PROGRESS"
                  : "SAVED GRASSHOPPER GRAPH"}
              </span>
              <button aria-pressed={follow} onClick={() => setFollow(!follow)}>
                Follow agent {follow ? "on" : "off"}
              </button>
            </div>
            <Canvas
              graph={graph}
              controls={definition?.controls}
              disabled
              hasDefinition={!!definition}
              highlightIds={highlights}
              activityStatus={active?.status}
              followActivity={follow}
              focusKey={active?.at || active?.id}
            />
          </div>
          <aside className="agent-timeline">
            {actions && (
              <div className="agent-plan">
                <span className="eyebrow">THE PLAN</span>
                <ol>
                  {actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </div>
            )}
            <span className="eyebrow">ACTIVITY · CLICK TO INSPECT</span>
            <ol>
              {visible.map((e, i) => (
                <li key={e.id || i} className={e.status}>
                  <button
                    aria-pressed={active === e}
                    onClick={() => setChosen(chosen === i ? null : i)}
                  >
                    <span className="agent-event-mark">
                      {e.status === "passed"
                        ? "✓"
                        : e.status === "failed"
                          ? "!"
                          : "◌"}
                    </span>
                    <span>
                      {activityMessage(e)}
                      <small>
                        {e.status === "running" && !pending
                          ? "Not completed"
                          : e.status === "passed"
                            ? "Complete"
                            : e.status === "failed"
                              ? "Not applied"
                              : "In progress"}
                      </small>
                    </span>
                  </button>
                  {e.changes?.length > 0 && (
                    <ul className="agent-changes">
                      {e.changes.map((c, j) => (
                        <li key={j}>
                          {c.op} <b>{c.label}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            {!visible.length && (
              <p className="agent-timeline-empty">
                The graph is ready. Actions will appear here as they happen.
              </p>
            )}
            {pending && seconds > 20 && (
              <p className="agent-wait-note">
                Still working. You can pan and inspect the canvas while the next
                action is prepared.
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
