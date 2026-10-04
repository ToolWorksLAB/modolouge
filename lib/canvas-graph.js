export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function graphBounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: 400, height: 240 };
  const x = Math.min(...nodes.map((n) => n.bounds.x));
  const y = Math.min(...nodes.map((n) => n.bounds.y));
  return {
    x,
    y,
    width: Math.max(...nodes.map((n) => n.bounds.x + n.bounds.width)) - x,
    height: Math.max(...nodes.map((n) => n.bounds.y + n.bounds.height)) - y,
  };
}
export function fitCamera(bounds, size) {
  const scale = clamp(
    Math.min(
      (size.width - 100) / (bounds.width + 40),
      (size.height - 170) / (bounds.height + 40),
    ),
    0.02,
    1.8,
  );
  return {
    x: size.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * scale,
    scale,
  };
}
export function zoomCamera(camera, factor, point) {
  const scale = clamp(camera.scale * factor, 0.02, 4);
  const ratio = scale / camera.scale;
  return {
    x: point.x - (point.x - camera.x) * ratio,
    y: point.y - (point.y - camera.y) * ratio,
    scale,
  };
}
export function portAnchor(node, direction, id) {
  const ports = node[direction],
    i = ports.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const b = node.bounds;
  return {
    x: b.x + (direction === "outputs" ? b.width : 0),
    y: b.y + (b.height * (i + 0.5)) / ports.length,
  };
}
export function wirePath(a, b) {
  const bend = Math.max(45, Math.abs(b.x - a.x) * 0.48);
  return `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`;
}
