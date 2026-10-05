// Portable presentation only. No Grasshopper archives, solver values or credentials.
export const CATALOG = [
  {
    type: "section",
    label: "Section",
    icon: "▣",
    group: "Layout",
    hint: "A titled surface for related elements",
  },
  {
    type: "stack",
    label: "Stack",
    icon: "☰",
    group: "Layout",
    hint: "Flow vertically or wrap horizontally",
  },
  {
    type: "grid",
    label: "Grid",
    icon: "⊞",
    group: "Layout",
    hint: "Responsive columns with weighted tracks",
  },
  {
    type: "text",
    label: "Text",
    icon: "T",
    group: "Layout",
    hint: "A heading, instruction or description",
  },
  {
    type: "image",
    label: "Image",
    icon: "▧",
    group: "Layout",
    hint: "Upload a PNG, JPEG or WebP",
  },
  {
    type: "slider",
    label: "Grasshopper slider",
    icon: "⊸",
    group: "Inputs",
    hint: "Bind a number slider from your definition",
  },
  {
    type: "interaction",
    label: "Viewport interaction",
    icon: "✥",
    group: "Inputs",
    native: true,
    hint: "Native point/plane gumballs need a dedicated web binding. Viewport orbit and pan already work.",
  },
  {
    type: "button",
    label: "Button",
    icon: "↗",
    group: "Inputs",
    hint: "Explicitly update geometry; one run per click",
  },
  {
    type: "toggle",
    label: "Toggle",
    icon: "◐",
    group: "Inputs",
    hint: "Bind a Grasshopper Boolean Toggle",
  },
  {
    type: "ruler",
    label: "Moving ruler",
    icon: "┼",
    group: "Inputs",
    hint: "Drag a numeric value; hold Shift for finer control",
  },
  {
    type: "point",
    label: "Point slider",
    icon: "⊹",
    group: "Inputs",
    native: true,
    hint: "Native MD Slider domains and point bindings are not exposed by the Linux bridge yet.",
  },
  {
    type: "mapper",
    label: "Graph mapper",
    icon: "∿",
    group: "Inputs",
    native: true,
    hint: "Native Bezier GraphMapper editing needs a dedicated Linux binding.",
  },
  {
    type: "textInput",
    label: "Text input",
    icon: "I",
    group: "Inputs",
    hint: "Bind an unwired Grasshopper Panel",
  },
  {
    type: "file",
    label: "File content",
    icon: "↥",
    group: "Inputs",
    hint: "Read a small text file into a Panel; browser files have no server path",
  },
  {
    type: "viewport",
    label: "Rhino viewport",
    icon: "◈",
    group: "Outputs",
    hint: "The geometry from the latest compute result",
  },
  {
    type: "value",
    label: "Value display",
    icon: "42",
    group: "Outputs",
    hint: "Read an input or an actual solved output",
  },
  {
    type: "chart",
    label: "Quick graph",
    icon: "⌁",
    group: "Outputs",
    hint: "Plot a solved numeric list, preserving gaps",
  },
];
export const CONTAINERS = new Set(["section", "stack", "grid"]);
export const MAX_DESIGN_BYTES = 900000;
const supported = new Set(CATALOG.filter((x) => !x.native).map((x) => x.type));
const text = (v, n = 160) => (typeof v === "string" ? v.slice(0, n) : "");
const number = (v, fallback, lo, hi) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
export const uid = () => globalThis.crypto.randomUUID();
export function element(type, patch = {}) {
  if (!supported.has(type))
    throw new Error("This element needs a native binding first.");
  return {
    id: uid(),
    type,
    label: CATALOG.find((x) => x.type === type).label,
    text: type === "text" ? "Make room for your idea." : "",
    children: [],
    gap: 16,
    padding: CONTAINERS.has(type) ? 20 : 0,
    columns: 2,
    direction: "vertical",
    ratio: "equal",
    height: type === "viewport" ? 440 : type === "image" ? 180 : 0,
    span: 1,
    hidden: false,
    locked: false,
    ...patch,
  };
}
export function definitionKey(definition) {
  const source = [
    definition?.filename || "untitled",
    ...(definition?.graph?.nodes || definition?.controls || [])
      .map((n) => n.id || n.instanceId || n.name)
      .sort(),
  ].join("|");
  let a = 2166136261,
    b = 5381;
  for (const c of source) {
    a = Math.imul(a ^ c.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ c.charCodeAt(0);
  }
  return `v1-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
export function initialDesign(definition) {
  const controls = (definition?.controls || []).slice(0, 100).map((c, index) =>
    element(
      c.kind === "number"
        ? "slider"
        : c.kind === "boolean"
          ? "toggle"
          : "textInput",
      {
        id: "input-" + index,
        label: c.label,
        binding: c.instanceId || c.name,
      },
    ),
  );
  const heading = element("text", {
    id: "introduction",
    label: "Introduction",
    text: "A shape of your own.",
    textStyle: "heading",
  });
  const inputs = element("section", {
    id: "parameters",
    label: "Shape & proportions",
    children: [
      ...controls,
      element("button", { id: "solve", label: "Update geometry" }),
    ],
  });
  return {
    format: "modolouge-app",
    version: 1,
    title:
      definition?.filename
        ?.replace(/\.(gh|ghx)$/i, "")
        .replace(/[-_]+/g, " ")
        .slice(0, 160) || "Untitled application",
    definitionKey: definitionKey(definition),
    definitionName: definition?.filename || "",
    theme: "paper",
    nodes: [
      heading,
      element("grid", {
        id: "layout",
        label: "Application layout",
        ratio: "wide-right",
        padding: 0,
        children: [
          inputs,
          element("viewport", { id: "viewport", label: "Perspective" }),
        ],
      }),
    ],
  };
}
export function flatten(nodes, parent = null, depth = 0) {
  return nodes.flatMap((n) => [
    { node: n, parent, depth },
    ...flatten(n.children || [], n.id, depth + 1),
  ]);
}
export function arrangeDesign(doc, arrangement) {
  const grid = flatten(doc.nodes).find(({ node }) => node.type === "grid");
  if (!grid || isLocked(doc, grid.node.id)) return doc;
  const options = {
    side: { columns: 2, ratio: "wide-right" },
    balanced: { columns: 2, ratio: "equal" },
    stacked: { columns: 1, ratio: "equal" },
  };
  return options[arrangement]
    ? patchNode(doc, grid.node.id, options[arrangement])
    : doc;
}
export function findNode(doc, id) {
  return flatten(doc.nodes).find((x) => x.node.id === id);
}
export function isLocked(doc, id) {
  const item = findNode(doc, id);
  return (
    !!item && (item.node.locked || (item.parent && isLocked(doc, item.parent)))
  );
}
export function patchNode(doc, id, patch) {
  const item = findNode(doc, id);
  if (
    !item ||
    (item.parent && isLocked(doc, item.parent)) ||
    (item.node.locked && Object.keys(patch).some((k) => k !== "locked"))
  )
    return doc;
  const visit = (nodes) =>
    nodes.map((n) =>
      n.id === id
        ? { ...n, ...patch, id: n.id, type: n.type, children: n.children }
        : { ...n, children: visit(n.children) },
    );
  return { ...doc, nodes: visit(doc.nodes) };
}
export function insertNode(doc, node, parent = null, index = Infinity) {
  if (
    parent &&
    (!CONTAINERS.has(findNode(doc, parent)?.node.type) || isLocked(doc, parent))
  )
    throw new Error("Choose an unlocked section, stack or grid.");
  const insert = (nodes) => {
    const copy = [...nodes];
    copy.splice(Math.min(index, copy.length), 0, node);
    return copy;
  };
  const visit = (nodes) =>
    nodes.map((n) =>
      n.id === parent
        ? { ...n, children: insert(n.children) }
        : { ...n, children: visit(n.children) },
    );
  return validateDesign({
    ...doc,
    nodes: parent ? visit(doc.nodes) : insert(doc.nodes),
  });
}
export function removeNode(doc, id) {
  const item = findNode(doc, id);
  if (
    !item ||
    isLocked(doc, id) ||
    flatten([item.node]).some((x) => x.node.locked)
  )
    return doc;
  const visit = (nodes) =>
    nodes
      .filter((n) => n.id !== id)
      .map((n) => ({ ...n, children: visit(n.children) }));
  return { ...doc, nodes: visit(doc.nodes) };
}
export function moveNode(doc, id, parent, index = Infinity) {
  const item = findNode(doc, id);
  if (!item || isLocked(doc, id))
    throw new Error("Unlock this element before moving it.");
  if (flatten([item.node]).some((x) => x.node.id === parent || x.node.locked))
    throw new Error("A group cannot move into itself or move locked children.");
  const siblings = item.parent
    ? findNode(doc, item.parent).node.children
    : doc.nodes;
  const oldIndex = siblings.findIndex((n) => n.id === id);
  if (parent === item.parent && oldIndex < index) index--;
  return insertNode(removeNode(doc, id), item.node, parent, index);
}
export function duplicateNode(doc, id) {
  const item = findNode(doc, id);
  if (!item || isLocked(doc, id)) return doc;
  const clone = (n) => ({
    ...n,
    id: uid(),
    locked: false,
    children: n.children.map(clone),
  });
  const siblings = item.parent
    ? findNode(doc, item.parent).node.children
    : doc.nodes;
  return insertNode(
    doc,
    { ...clone(item.node), label: item.node.label + " copy" },
    item.parent,
    siblings.findIndex((n) => n.id === id) + 1,
  );
}
export function validateDesign(raw) {
  if (
    !raw ||
    raw.format !== "modolouge-app" ||
    raw.version !== 1 ||
    !Array.isArray(raw.nodes)
  )
    throw new Error("Choose a version 1 .modolouge.json layout file.");
  if (JSON.stringify(raw).length > MAX_DESIGN_BYTES)
    throw new Error("Layout is too large. Keep it below 900 KB.");
  const ids = new Set();
  let count = 0,
    viewports = 0;
  const visit = (nodes, depth) => {
    if (depth > 8 || !Array.isArray(nodes))
      throw new Error("Layouts support eight nesting levels.");
    return nodes.map((n) => {
      if (
        !n ||
        !supported.has(n.type) ||
        ++count > 150 ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id) ||
        ids.has(n.id)
      )
        throw new Error(
          "Invalid or duplicate element. Use at most 150 elements.",
        );
      ids.add(n.id);
      if (n.type === "viewport" && ++viewports > 3)
        throw new Error("Use at most three viewports in one app.");
      const children = visit(n.children || [], depth + 1);
      if (children.length && !CONTAINERS.has(n.type))
        throw new Error(
          "Only sections, stacks and grids can contain elements.",
        );
      const image = text(n.image, 350000);
      if (
        image &&
        (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ||
          n.image.length > 350000)
      )
        throw new Error("Images must be PNG, JPEG or WebP, below 250 KB.");
      return {
        id: n.id,
        type: n.type,
        label: text(n.label),
        text: text(n.text, 5000),
        binding: text(n.binding, 220),
        source: text(n.source, 250),
        unit: text(n.unit, 24),
        image,
        children,
        gap: number(n.gap, 16, 0, 64),
        padding: number(n.padding, 0, 0, 64),
        height: number(n.height, 0, 0, 1000),
        span: Math.round(number(n.span, 1, 1, 3)),
        columns: Math.round(number(n.columns, 2, 1, 3)),
        direction: n.direction === "horizontal" ? "horizontal" : "vertical",
        ratio: ["equal", "wide-left", "wide-right"].includes(n.ratio)
          ? n.ratio
          : "equal",
        textStyle: n.textStyle === "heading" ? "heading" : "body",
        fit: n.fit === "cover" ? "cover" : "contain",
        hidden: !!n.hidden,
        locked: !!n.locked,
      };
    });
  };
  return {
    format: "modolouge-app",
    version: 1,
    title: text(raw.title) || "Untitled application",
    definitionKey: text(raw.definitionKey, 80),
    definitionName: text(raw.definitionName, 220),
    theme: raw.theme === "graphite" ? "graphite" : "paper",
    nodes: visit(raw.nodes, 0),
  };
}
export function boundControl(node, definition) {
  const kind = ["slider", "ruler"].includes(node.type)
    ? "number"
    : node.type === "toggle"
      ? "boolean"
      : ["textInput", "file"].includes(node.type)
        ? "text"
        : null;
  return definition?.controls?.find(
    (c) =>
      (c.instanceId || c.name) === node.binding && (!kind || kind === c.kind),
  );
}
export function plotSeries(items) {
  const values = items.slice(0, 2000).map((v) => {
    if (
      typeof v === "string" &&
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())
    )
      v = Number(v);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
  const finite = values.filter((v) => v !== null);
  if (!finite.length) return null;
  const min = Math.min(...finite),
    max = Math.max(...finite),
    span = max - min || 1;
  const points = values.map((v, i) =>
    v === null
      ? null
      : [
          20 + (values.length === 1 ? 130 : (i * 260) / (values.length - 1)),
          max === min ? 75 : 130 - ((v - min) * 110) / span,
        ],
  );
  let path = "",
    open = false;
  for (const p of points) {
    if (!p) {
      open = false;
      continue;
    }
    path += `${open ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)} `;
    open = true;
  }
  return { min, max, points, path, count: finite.length };
}
