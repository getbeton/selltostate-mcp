export const DEFAULT_MCP_URL = "https://app.selltostate.com/api/mcp";

export async function handleRpc(msg, deps) {
  if (!msg || msg.jsonrpc !== "2.0") return null;
  if (msg.method && msg.id === undefined) return null;
  if (msg.method === "ping") {
    return { jsonrpc: "2.0", id: msg.id, result: {} };
  }
  // initialize goes upstream too: the server sets the protocol version and its instructions.
  if (msg.method !== "initialize" && msg.method !== "tools/list" && msg.method !== "tools/call") {
    return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32601, message: "method not found" } };
  }
  if (msg.method === "tools/call" && !deps.apiKey) {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32001, message: "Set STS_API_KEY" },
    };
  }
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (deps.apiKey) headers["x-api-key"] = deps.apiKey;
  const res = await deps.fetchImpl(deps.url, {
    method: "POST",
    headers,
    body: JSON.stringify(msg),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (res.status === 402) {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      error: {
        code: 402,
        message: "payment_required",
        data: parsed,
      },
    };
  }
  if (parsed && parsed.jsonrpc) return parsed;
  return { jsonrpc: "2.0", id: msg.id, result: parsed };
}
