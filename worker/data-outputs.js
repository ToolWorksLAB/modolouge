// Bound primitive previews for readouts/charts. Never forward arbitrary objects.
export function previewData(values = []) {
  let total = 0,
    characters = 0;
  const results = [];
  for (const tree of values.slice(0, 200)) {
    const output = {
      name: String(tree.ParamName || tree.paramName || "").slice(0, 220),
      items: [],
      truncated: false,
    };
    const branches = Object.entries(
      tree.InnerTree || tree.innerTree || {},
    ).sort(([a], [b]) => {
      const pa = a.match(/-?\d+/g)?.map(Number) || [],
        pb = b.match(/-?\d+/g)?.map(Number) || [];
      for (let i = 0; i < Math.min(pa.length, pb.length); i++)
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return pa.length - pb.length;
    });
    outer: for (const [, branch] of branches) {
      if (!Array.isArray(branch)) continue;
      for (const item of branch) {
        if (
          !/^System\.(Double|Single|Decimal|Int16|Int32|Int64|UInt16|UInt32|UInt64|Boolean|String)$/.test(
            item.type || "",
          )
        )
          continue;
        if (
          total >= 10000 ||
          characters >= 100000 ||
          output.items.length >= 2000
        ) {
          output.truncated = true;
          break outer;
        }
        let value;
        try {
          value =
            typeof item.data === "string" ? JSON.parse(item.data) : item.data;
        } catch {
          value = null;
        }
        if (item.type === "System.String") {
          if (typeof value !== "string") value = null;
          else {
            if (value.length > 2000) output.truncated = true;
            value = value.slice(0, Math.min(2000, 100000 - characters));
            characters += value.length;
          }
        } else if (item.type === "System.Boolean")
          value = typeof value === "boolean" ? value : null;
        else
          value =
            typeof value === "number" && Number.isFinite(value) ? value : null;
        output.items.push(value);
        total++;
      }
    }
    if (output.items.length || output.truncated) results.push(output);
  }
  return results;
}
