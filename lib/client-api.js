export async function api(path, body) {
  const response = await fetch(
    "/api/" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Request failed."), {
      code: result.code,
      status: response.status,
    });
  return result;
}

export async function agentRequest(body, onEvent) {
  const response = await fetch("/api/apps/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!response.ok) {
    const e = await response.json();
    throw Object.assign(new Error(e.error || "Agent request failed."), {
      status: response.status,
      code: e.code,
    });
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    result;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.error)
          throw Object.assign(new Error(message.error), {
            status: message.status,
            code: message.code,
          });
        if (message.event) onEvent(message.event);
        if (message.app) result = message.app;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!result)
    throw new Error(
      "The connection ended. Check My apps for your latest saved version before retrying.",
    );
  return result;
}
