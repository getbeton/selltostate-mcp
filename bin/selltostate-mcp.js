#!/usr/bin/env node
// MCP stdio transport: one JSON-RPC message per line on stdin and on stdout.
import { createInterface } from "node:readline";
import { DEFAULT_MCP_URL, handleRpc } from "../src/handle.js";

const deps = {
  apiKey: process.env.STS_API_KEY || "",
  url: process.env.STS_MCP_URL || DEFAULT_MCP_URL,
  fetchImpl: globalThis.fetch,
};

const write = (msg) => msg && process.stdout.write(JSON.stringify(msg) + "\n");

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    continue;
  }
  try {
    write(await handleRpc(msg, deps));
  } catch (err) {
    if (msg.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `upstream: ${err.message}` } });
  }
}
