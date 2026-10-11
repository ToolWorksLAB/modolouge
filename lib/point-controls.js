export function validPoint(value) {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6,
    )
  );
}
export function pointControls(controls = [], values = {}) {
  return controls
    .filter((c) => c.kind === "point" && validPoint(values[c.name] ?? c.value))
    .map((c, i) => ({
      ...c,
      label:
        c.label === "Pt" || c.label === "Point" ? `Point ${i + 1}` : c.label,
      position: values[c.name] ?? c.value,
    }));
}
export const sameValue = (a, b) =>
  Array.isArray(a) || Array.isArray(b)
    ? validPoint(a) && validPoint(b) && a.every((v, i) => v === b[i])
    : a === b;
