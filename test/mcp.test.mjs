import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { handleRpc } from "../src/handle.js";

test("initialize is forwarded, so the server sets the protocol version", async () => {
  let body;
  const out = await handleRpc(
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    {
      apiKey: "",
      url: "http://fixture/mcp",
      fetchImpl: async (url, init) => {
        body = JSON.parse(init.body);
        return { status: 200, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 0, result: { protocolVersion: "2025-06-18", instructions: "x" } }) };
      },
    },
  );
  assert.equal(body.method, "initialize");
  assert.equal(out.result.protocolVersion, "2025-06-18");
  assert.equal(out.result.instructions, "x");
});

test("stdio: one JSON message per line in and out, no reply to a notification", async () => {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const msg = JSON.parse(raw);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "alpha" }] } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const child = spawn(process.execPath, [new URL("../bin/selltostate-mcp.js", import.meta.url).pathname], {
    env: { ...process.env, STS_MCP_URL: url, STS_API_KEY: "" },
  });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  child.stdin.write('{"jsonrpc":"2.0","id":7,"method":"tools/list"}\n');
  child.stdin.write("not json\n");
  child.stdin.end();
  await new Promise((r) => child.on("close", r));
  server.close();
  const lines = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(out.includes("Content-Length"), false);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { jsonrpc: "2.0", id: 7, result: { tools: [{ name: "alpha" }] } });
  assert.equal(lines[1].error.code, -32700);
});

test("tools/list forwards upstream names", async () => {
  let calls = 0;
  const out = await handleRpc(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    {
      apiKey: "",
      url: "http://fixture/mcp",
      fetchImpl: async () => {
        calls += 1;
        return { status: 200, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "alpha" }, { name: "beta" }] } }) };
      },
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(out.result.tools.map((t) => t.name), ["alpha", "beta"]);
});

test("tools/call adds the key and does not open a connection when the key is missing", async () => {
  let calls = 0;
  const missing = await handleRpc(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami" } },
    { apiKey: "", url: "http://fixture/mcp", fetchImpl: async () => { calls += 1; return { status: 200, text: async () => "{}" }; } },
  );
  assert.equal(calls, 0);
  assert.match(missing.error.message, /STS_API_KEY/);

  let headers;
  await handleRpc(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami", arguments: {} } },
    {
      apiKey: "sts_test",
      url: "http://fixture/mcp",
      fetchImpl: async (url, init) => {
        headers = init.headers;
        assert.equal(JSON.parse(init.body).method, "tools/call");
        return { status: 200, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 3, result: { ok: true } }) };
      },
    },
  );
  assert.equal(headers["x-api-key"], "sts_test");
});

test("402 surfaces payment_link", async () => {
  const out = await handleRpc(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search" } },
    {
      apiKey: "sts_test",
      url: "http://fixture/mcp",
      fetchImpl: async () => ({ status: 402, text: async () => JSON.stringify({ payment_link: "https://pay.example", plan: "data-monthly" }) }),
    },
  );
  assert.equal(out.error.code, 402);
  assert.equal(out.error.data.payment_link, "https://pay.example");
});

test("readme does not advertise the npm package", () => {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.equal(md.includes("npx @selltostate/mcp"), false);
  assert.equal(md.includes("linkedin.com"), false);
});
