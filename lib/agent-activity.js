// Public action summaries only: no hidden reasoning, archive bytes or signed URLs.
export function activityMessage(event) {
  if (typeof event?.message === "string" && event.message.trim())
    return event.message;
  const labels = {
    read_definition: "Read the definition",
    read_full_graph: "Read the graph",
    inspect_connections: "Inspected connections",
    test_definition: "Tested geometry",
    validate_app: "Checked app bindings",
    presentation_update: "Updated the interface",
    save_app: "Saved the draft",
  };
  return labels[event?.tool] || "Completed a build step";
}
export function mergeActivity(events, event) {
  const entry = { ...event, message: activityMessage(event) };
  const key = entry.id;
  const index = key ? events.findIndex((e) => e.id === key) : -1;
  return (
    index < 0
      ? [...events, entry]
      : events.map((e, i) => (i === index ? { ...e, ...entry } : e))
  ).slice(-40);
}
export function editSummary(edits, graph) {
  const nodes = new Map((graph?.nodes || []).map((n) => [n.id, n]));
  return edits.map((e) => ({
    op: e.op,
    nodeId: e.nodeId,
    newId: e.newId || undefined,
    sourceNode: e.sourceNode || undefined,
    label:
      nodes.get(e.nodeId)?.label || nodes.get(e.nodeId)?.name || "Component",
  }));
}
export function changedNodeIds(before, after) {
  const previous = new Map((before?.nodes || []).map((n) => [n.id, n]));
  const changed = new Set(
    (after?.nodes || [])
      .filter((n) => JSON.stringify(n) !== JSON.stringify(previous.get(n.id)))
      .map((n) => n.id),
  );
  const oldWires = new Set((before?.wires || []).map((w) => JSON.stringify(w)));
  for (const w of after?.wires || [])
    if (!oldWires.has(JSON.stringify(w))) {
      changed.add(w.sourceNode);
      changed.add(w.targetNode);
    }
  return [...changed];
}
