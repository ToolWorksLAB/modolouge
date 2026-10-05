"use client";
export default function ModelControls({
  definition,
  values,
  busy,
  onChange,
  query,
  onQuery,
  onReset,
  runText,
  canRun,
  onRun,
  changes,
  hasResult,
}) {
  const controls = definition.controls.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <aside className="control-panel flow-controls">
      <div className="panel-heading">
        <h2>Make a change</h2>
        <button className="quiet" disabled={!!busy} onClick={onReset}>
          Reset
        </button>
      </div>
      <p className="flow-control-help">
        Adjust a few values, then update once.
      </p>
      {definition.controls.length > 6 && (
        <input
          className="flow-search"
          aria-label="Find a control"
          placeholder="Find a control…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      )}
      <div className="parameters">
        {!definition.controls.length && (
          <p className="muted">
            This file has no editable inputs. You can explore its geometry or
            customize its presentation.
          </p>
        )}
        {!!definition.controls.length && !controls.length && (
          <p className="muted">
            No matching controls.{" "}
            <button className="text-link" onClick={() => onQuery("")}>
              Clear search
            </button>
          </p>
        )}
        {controls.map((c) => (
          <div className="parameter" key={c.name}>
            <label htmlFor={c.name}>{c.label}</label>
            {c.kind === "number" ? (
              <>
                <input
                  aria-label={c.label + " value"}
                  type="number"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={values[c.name]}
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
                  id={c.name}
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={values[c.name]}
                  disabled={!!busy}
                  onChange={(e) => onChange(c.name, +e.target.value)}
                />
                <div className="range-ends">
                  <span>{c.min}</span>
                  <span>{c.max}</span>
                </div>
              </>
            ) : c.kind === "boolean" ? (
              <input
                id={c.name}
                type="checkbox"
                checked={values[c.name]}
                disabled={!!busy}
                onChange={(e) => onChange(c.name, e.target.checked)}
              />
            ) : (
              <input
                id={c.name}
                value={values[c.name]}
                disabled={!!busy}
                onChange={(e) => onChange(c.name, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flow-run">
        <p role="status" className={changes ? "flow-pending" : "fine"}>
          {changes
            ? `${changes} ${changes === 1 ? "change" : "changes"} not applied yet`
            : hasResult
              ? "You’re seeing the latest result."
              : "Ready for your first result."}
        </p>
        <button
          className="button primary solve"
          disabled={!canRun}
          onClick={onRun}
        >
          {runText}
          <span>↗</span>
        </button>
        <p className="fine">One update uses one geometry run.</p>
      </div>
    </aside>
  );
}
