#!/usr/bin/env node
import { DEFAULT_MCP_URL, handleRpc } from "../src/handle.js";

const apiKey = process.env.STS_API_KEY || "";
const url = process.env.STS_MCP_URL || DEFAULT_MCP_URL;
let buf = Buffer.alloc(0);

function write(msg) {
  if (!msg) return;
  const body = Buffer.from(JSON.stringify(msg));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

process.stdin.on("data", async (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const headerEnd = buf.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      const lineEnd = buf.indexOf("\n");
      if (lineEnd < 0 || buf.slice(0, lineEnd).includes("Content-Length")) return;
      const line = buf.slice(0, lineEnd).toString("utf8").trim();
      buf = buf.slice(lineEnd + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      write(await handleRpc(msg, { apiKey, url, fetchImpl: globalThis.fetch }));
      continue;
    }
    const header = buf.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) return;
    const len = Number(match[1]);
    const start = headerEnd + 4;
    if (buf.length < start + len) return;
    const msg = JSON.parse(buf.slice(start, start + len).toString("utf8"));
    buf = buf.slice(start + len);
    write(await handleRpc(msg, { apiKey, url, fetchImpl: globalThis.fetch }));
  }
});
