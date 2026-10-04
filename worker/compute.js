const endpoint = new URL(process.env.COMPUTE_URL || "http://127.0.0.1:5000");
if (!["http:", "https:"].includes(endpoint.protocol))
  throw new Error("COMPUTE_URL must be HTTP or HTTPS.");

export async function compute(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.COMPUTE_TIMEOUT_MS || 180000),
  );
  try {
    const response = await fetch(new URL(path, endpoint), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        RhinoComputeKey: process.env.RHINO_COMPUTE_KEY || "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `Rhino.Compute returned HTTP ${response.status}. Check the definition or contact the administrator.`,
      );
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "Compute timed out. Try a simpler definition or check the Compute service.",
      );
    if (error.message === "fetch failed")
      throw new Error(
        "Cannot reach Rhino.Compute. Start Compute or check COMPUTE_URL in .env.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function makeValues(controls, supplied = {}) {
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied))
    throw new Error("Invalid input values.");
  return controls.map((control) => {
    let value = Object.hasOwn(supplied, control.name)
      ? supplied[control.name]
      : control.value;
    if (control.kind === "number") {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`Invalid number for ${control.label}`);
      value = Math.min(control.max, Math.max(control.min, value));
      if (control.interval === 1) value = Math.round(value);
      if (control.interval >= 2) {
        const offset = control.interval === 3 ? 1 : 0;
        value = 2 * Math.round((value - offset) / 2) + offset;
        value = Math.min(
          2 * Math.floor((control.max - offset) / 2) + offset,
          Math.max(2 * Math.ceil((control.min - offset) / 2) + offset, value),
        );
      }
    } else if (control.kind === "boolean" && typeof value !== "boolean")
      throw new Error(`Invalid toggle for ${control.label}`);
    else if (control.kind === "text") value = String(value).slice(0, 10000);
    return {
      ParamName: control.name,
      InnerTree: {
        "{0}": [
          {
            type:
              control.kind === "boolean"
                ? "System.Boolean"
                : control.kind === "text"
                  ? "System.String"
                  : "System.Double",
            data: JSON.stringify(value),
          },
        ],
      },
    };
  });
}
