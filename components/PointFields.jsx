"use client";
import { validPoint } from "../lib/point-controls.js";
export default function PointFields({
  control,
  value,
  onChange,
  disabled,
  label,
  help = true,
}) {
  const point = validPoint(value) ? value : control.value;
  return (
    <fieldset className="point-fields" disabled={disabled}>
      <legend>{label || control.label} · position</legend>
      <div>
        {["X", "Y", "Z"].map((axis, i) => (
          <label key={axis}>
            {axis}
            <input
              type="number"
              aria-label={`${label || control.label} ${axis}`}
              min={-1e6}
              max={1e6}
              step="any"
              value={point[i]}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isFinite(n) && Math.abs(n) <= 1e6)
                  onChange(
                    control.name,
                    point.map((v, j) => (j === i ? n : v)),
                  );
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="text-link"
        onClick={() => onChange(control.name, [...control.value])}
      >
        Reset position ↶
      </button>
      {help && (
        <small>Drag its gumball in the viewport, then update the model.</small>
      )}
    </fieldset>
  );
}
