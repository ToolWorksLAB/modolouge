"use client";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clamp,
  fitCamera,
  graphBounds,
  portAnchor,
  wirePath,
  zoomCamera,
} from "../lib/canvas-graph.js";

const EMPTY = [];
function GraphMark() {
  return (
    <svg width="25" height="25" viewBox="0 0 25 25" aria-hidden="true">
      <path
        d="M4 6H8C14 6 11 17 17 17H21M4 18H8C14 18 11 8 17 8H21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect x="1" y="3" width="6" height="6" rx="2" fill="currentColor" />
      <rect x="1" y="15" width="6" height="6" rx="2" fill="currentColor" />
      <rect x="18" y="5" width="6" height="15" rx="2" fill="currentColor" />
    </svg>
  );
}
export default function GrasshopperCanvas({
  graph,
  controls = EMPTY,
  values = {},
  onValueChange,
  disabled = false,
  hasDefinition = false,
}) {
  const host = useRef(null),
    svg = useRef(null),
    size = useRef({ width: 800, height: 550 });
  const pointers = useRef(new Map()),
    drag = useRef(false),
    boundsRef = useRef(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState(null),
    [query, setQuery] = useState("");
  const patternId = useId().replaceAll(":", "");
  const nodes = graph?.nodes || EMPTY,
    wires = graph?.wires || EMPTY;
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const controlMap = useMemo(
    () => new Map(controls.map((c) => [c.instanceId, c])),
    [controls],
  );
  const bounds = useMemo(() => graphBounds(nodes), [nodes]);
  boundsRef.current = bounds;
  const fit = useCallback(
    () => setCamera(fitCamera(boundsRef.current, size.current)),
    [],
  );
  useEffect(() => {
    fit();
    setSelected(null);
    setQuery("");
  }, [graph, fit]);
  useEffect(() => {
    let initialized = false;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      const previous = size.current;
      size.current = { width, height };
      if (!initialized) {
        initialized = true;
        fit();
      } else
        setCamera((c) => ({
          ...c,
          x: c.x + (width - previous.width) / 2,
          y: c.y + (height - previous.height) / 2,
        }));
    });
    observer.observe(host.current);
    const element = svg.current;
    const wheel = (e) => {
      e.preventDefault();
      const r = element.getBoundingClientRect();
      setCamera((c) =>
        zoomCamera(c, Math.exp(-clamp(e.deltaY, -100, 100) * 0.006), {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        }),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, [fit]);
  function zoom(factor) {
    setCamera((c) =>
      zoomCamera(c, factor, {
        x: size.current.width / 2,
        y: size.current.height / 2,
      }),
    );
  }
  function focusNode(node) {
    setSelected(node.id);
    const s = Math.max(camera.scale, 1.4),
      b = node.bounds;
    setCamera({
      x: size.current.width * 0.43 - (b.x + b.width / 2) * s,
      y: size.current.height * 0.4 - (b.y + b.height / 2) * s,
      scale: s,
    });
  }
  const matches = query.trim()
    ? nodes
        .filter((n) =>
          `${n.label} ${n.name} ${n.text}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 20)
    : [];
  const active = nodeMap.get(selected),
    activeControl = controlMap.get(selected);
  const connected = useMemo(
    () =>
      new Set(
        wires
          .filter((w) => w.sourceNode === selected || w.targetNode === selected)
          .flatMap((w) => [w.sourceNode, w.targetNode]),
      ),
    [wires, selected],
  );
  function pointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = false;
  }
  function pointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    const before = [...pointers.current.values()];
    const old = pointers.current.get(e.pointerId);
    const dx = e.clientX - old.x,
      dy = e.clientY - old.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.current = true;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (before.length < 2)
      setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    else {
      const after = [...pointers.current.values()],
        r = svg.current.getBoundingClientRect();
      const midpoint = (p) => ({
        x: (p[0].x + p[1].x) / 2 - r.left,
        y: (p[0].y + p[1].y) / 2 - r.top,
      });
      const distance = (p) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const a = midpoint(before),
        b = midpoint(after);
      setCamera((c) => {
        const next = zoomCamera(
          c,
          distance(after) / Math.max(distance(before), 1),
          a,
        );
        return { ...next, x: next.x + b.x - a.x, y: next.y + b.y - a.y };
      });
    }
  }
  function pointerUp(e) {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
    <div className="gh-canvas" ref={host}>
      <svg
        ref={svg}
        className="gh-surface"
        aria-label="Grasshopper definition canvas"
        role="region"
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onLostPointerCapture={(e) => pointers.current.delete(e.pointerId)}
        onClick={() => {
          if (!drag.current) setSelected(null);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (["f", "F", "0"].includes(e.key)) {
            e.preventDefault();
            fit();
          }
          if (["+", "="].includes(e.key)) {
            e.preventDefault();
            zoom(1.25);
          }
          if (e.key === "-") {
            e.preventDefault();
            zoom(0.8);
          }
          if (e.key === "Escape") {
            setSelected(null);
            setQuery("");
          }
          if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            setCamera((c) => ({
              ...c,
              x:
                c.x +
                (e.key === "ArrowLeft" ? 40 : e.key === "ArrowRight" ? -40 : 0),
              y:
                c.y +
                (e.key === "ArrowUp" ? 40 : e.key === "ArrowDown" ? -40 : 0),
            }));
          }
        }}
      >
        <defs>
          <pattern
            id={patternId}
            width={20 * camera.scale}
            height={20 * camera.scale}
            patternUnits="userSpaceOnUse"
            x={camera.x}
            y={camera.y}
          >
            <circle cx="1" cy="1" r="0.7" fill="#a9aa9c" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        <g
          transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}
        >
          {(graph?.groups || EMPTY).map((group) => {
            const members = group.members
              .map((id) => nodeMap.get(id))
              .filter(Boolean);
            if (!members.length) return null;
            const b = graphBounds(members);
            return (
              <g key={group.id} className="gh-group">
                <rect
                  x={b.x - 20}
                  y={b.y - 35}
                  width={b.width + 40}
                  height={b.height + 55}
                  rx="13"
                  fill={group.color}
                  fillOpacity="0.13"
                  stroke={group.color}
                  strokeOpacity="0.6"
                />
                <text x={b.x - 8} y={b.y - 16}>
                  {group.label.slice(0, 70)}
                </text>
              </g>
            );
          })}
          {wires.map((wire, i) => {
            const source = nodeMap.get(wire.sourceNode),
              target = nodeMap.get(wire.targetNode);
            if (!source || !target) return null;
            const a = portAnchor(source, "outputs", wire.sourcePort),
              b = portAnchor(target, "inputs", wire.targetPort);
            return a && b ? (
              <path
                key={i}
                d={wirePath(a, b)}
                className={`gh-wire ${selected && (wire.sourceNode === selected || wire.targetNode === selected) ? "is-active" : ""}`}
                opacity={
                  selected &&
                  wire.sourceNode !== selected &&
                  wire.targetNode !== selected
                    ? 0.2
                    : 1
                }
              />
            ) : null;
          })}
          {nodes.map((node) => {
            const b = node.bounds,
              control = controlMap.get(node.id),
              value = control ? (values[control.name] ?? control.value) : null;
            const selectedNode = selected === node.id,
              compact = b.width < 100;
            return (
              <g
                key={node.id}
                className={`gh-node gh-${node.kind} ${selectedNode ? "is-selected" : ""} ${node.locked ? "is-locked" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}, ${node.name}${control ? ", value " + value : ""}`}
                aria-pressed={selectedNode}
                opacity={
                  selected && !selectedNode && !connected.has(node.id) ? 0.4 : 1
                }
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(node.id);
                }}
                onKeyDown={(e) => {
                  if (["Enter", " "].includes(e.key)) {
                    e.preventDefault();
                    setSelected(node.id);
                  }
                  if (e.key === "Escape") setSelected(null);
                }}
              >
                <title>{`${node.name}${node.description ? " — " + node.description : ""}`}</title>
                <rect
                  className="gh-node-body"
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  rx={
                    node.kind === "panel"
                      ? 3
                      : node.kind === "scribble"
                        ? 0
                        : Math.min(10, b.height / 2)
                  }
                />
                {node.kind === "slider" ? (
                  <>
                    <text
                      x={b.x + 9}
                      y={b.y + b.height / 2 + 4}
                      className="gh-node-label"
                    >
                      {node.label.slice(
                        0,
                        Math.max(4, Math.floor((b.width - 70) / 7)),
                      )}
                    </text>
                    <text
                      textAnchor="end"
                      x={b.x + b.width - 10}
                      y={b.y + b.height / 2 + 4}
                      className="gh-value"
                    >
                      {value === null
                        ? "slider"
                        : Number(value).toLocaleString("en", {
                            maximumFractionDigits: 5,
                          })}
                    </text>
                    {control && (
                      <line
                        x1={b.x + 8}
                        y1={b.y + b.height - 3}
                        x2={
                          b.x +
                          8 +
                          (b.width - 16) *
                            clamp(
                              (Number(value) - control.min) /
                                (control.max - control.min || 1),
                              0,
                              1,
                            )
                        }
                        y2={b.y + b.height - 3}
                        className="gh-slider-fill"
                      />
                    )}
                  </>
                ) : node.kind === "panel" || node.kind === "scribble" ? (
                  <>
                    <text x={b.x + 9} y={b.y + 17} className="gh-node-label">
                      {node.label.slice(
                        0,
                        Math.max(3, Math.floor((b.width - 18) / 7)),
                      )}
                    </text>
                    {node.text
                      .split(/\r?\n/)
                      .slice(
                        0,
                        Math.max(
                          0,
                          Math.min(12, Math.floor((b.height - 30) / 15)),
                        ),
                      )
                      .map((line, i) => (
                        <text
                          key={i}
                          x={b.x + 9}
                          y={b.y + 35 + i * 15}
                          className="gh-panel-text"
                        >
                          {line.slice(
                            0,
                            Math.max(3, Math.floor((b.width - 18) / 6)),
                          )}
                        </text>
                      ))}
                  </>
                ) : (
                  <text
                    className="gh-node-label"
                    textAnchor="middle"
                    transform={`translate(${b.x + b.width / 2} ${b.y + b.height / 2})${compact && b.height > 50 ? " rotate(-90)" : ""}`}
                    dy="4"
                  >
                    {(node.kind === "toggle" && value !== null
                      ? `${node.label} · ${value ? "True" : "False"}`
                      : node.label
                    ).slice(
                      0,
                      Math.max(
                        4,
                        Math.floor(
                          ((compact && b.height > 50 ? b.height : b.width) -
                            16) /
                            7,
                        ),
                      ),
                    )}
                  </text>
                )}
                {["inputs", "outputs"].map((direction) =>
                  node[direction].map((port) => {
                    const p = portAnchor(node, direction, port.id),
                      input = direction === "inputs";
                    return (
                      <g key={direction + port.id}>
                        <circle cx={p.x} cy={p.y} r="3" className="gh-port" />
                        <title>{`${input ? "Input" : "Output"}: ${port.name || port.label}${port.description ? " — " + port.description : ""}`}</title>
                        {node.kind === "component" && (
                          <text
                            x={p.x + (input ? 9 : -9)}
                            y={p.y + 3.5}
                            textAnchor={input ? "start" : "end"}
                            className="gh-port-label"
                          >
                            {(port.label || port.name).slice(
                              0,
                              compact ? 2 : 5,
                            )}
                          </text>
                        )}
                      </g>
                    );
                  }),
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="gh-heading">
        <span className="gh-mark">
          <GraphMark />
        </span>
        <div>
          <strong>Grasshopper</strong>
          <span>DEFINITION CANVAS</span>
        </div>
        <span className="gh-readonly">Viewer</span>
      </div>
      {!!nodes.length && (
        <div className="gh-search">
          <label>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Find a Grasshopper component"
              placeholder="Find a component…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  focusNode(matches[0]);
                  setQuery("");
                }
                if (e.key === "Escape") setQuery("");
              }}
            />
          </label>
          {query.trim() && (
            <div className="gh-search-results">
              {matches.length ? (
                matches.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      focusNode(n);
                      setQuery("");
                    }}
                  >
                    <strong>{n.label}</strong>
                    <span>{n.name}</span>
                  </button>
                ))
              ) : (
                <p>No matching components.</p>
              )}
            </div>
          )}
        </div>
      )}
      {!nodes.length && (
        <div className="gh-empty">
          <GraphMark />
          <h2>
            The logic behind the form<span>.</span>
          </h2>
          <p>
            {hasDefinition
              ? "Upload this definition again to see its canvas."
              : "Drop a Grasshopper definition to reveal its components, connections and controls."}
          </p>
          <span>SLIDERS → COMPONENTS → GEOMETRY</span>
        </div>
      )}
      {active && (
        <aside className="gh-inspector" aria-label="Selected component">
          <div className="gh-inspector-title">
            <span>{active.kind.toUpperCase()}</span>
            <button
              aria-label="Close component details"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <h3>{active.label}</h3>
          <p>
            {active.name}
            {active.locked ? " · Disabled in file" : ""}
            {active.hidden ? " · Preview hidden in file" : ""}
          </p>
          {active.description && <p>{active.description}</p>}
          {active.text && <pre>{active.text}</pre>}
          {activeControl && (
            <div className="gh-control">
              <label htmlFor={`${patternId}-control`}>
                {activeControl.label}
                <output>
                  {String(values[activeControl.name] ?? activeControl.value)}
                </output>
              </label>
              {activeControl.kind === "number" ? (
                <input
                  id={`${patternId}-control`}
                  aria-label={`Canvas ${activeControl.label}`}
                  type="range"
                  min={activeControl.min}
                  max={activeControl.max}
                  step={activeControl.step}
                  value={values[activeControl.name] ?? activeControl.value}
                  disabled={disabled || !onValueChange}
                  onChange={(e) =>
                    onValueChange(activeControl.name, +e.target.value)
                  }
                />
              ) : (
                <input
                  id={`${patternId}-control`}
                  type="checkbox"
                  checked={
                    !!(values[activeControl.name] ?? activeControl.value)
                  }
                  disabled={disabled || !onValueChange}
                  onChange={(e) =>
                    onValueChange(activeControl.name, e.target.checked)
                  }
                />
              )}
              <small>Use Update geometry to run your changes.</small>
            </div>
          )}
          <div className="gh-port-details">
            {["inputs", "outputs"].map(
              (direction) =>
                active[direction].length > 0 && (
                  <div key={direction}>
                    <span>
                      {direction.toUpperCase()} · {active[direction].length}
                    </span>
                    {active[direction].slice(0, 12).map((p, i) => (
                      <p key={p.id + i} title={p.description}>
                        <b>{p.label || "○"}</b>
                        {p.name}
                      </p>
                    ))}
                  </div>
                ),
            )}
          </div>
        </aside>
      )}
      {graph?.notes?.length > 0 && (
        <details className="gh-notes">
          <summary>Canvas notes ({graph.notes.length})</summary>
          {graph.notes.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </details>
      )}
      <div className="gh-footer">
        <span>
          {nodes.length
            ? `${nodes.length} components / ${wires.length} wires`
            : "YOUR DEFINITION, UNPACKED"}
        </span>
        <span className="gh-hint">Drag to pan · Scroll to zoom · F to fit</span>
      </div>
      <div className="gh-tools" aria-label="Canvas navigation">
        <button aria-label="Zoom out canvas" onClick={() => zoom(0.8)}>
          −
        </button>
        <output aria-live="polite">{Math.round(camera.scale * 100)}%</output>
        <button aria-label="Zoom in canvas" onClick={() => zoom(1.25)}>
          +
        </button>
        <span />
        <button onClick={fit} title="Fit definition (F)">
          Fit
        </button>
      </div>
    </div>
  );
}
