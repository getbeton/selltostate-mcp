import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleRpc } from "../src/handle.js";

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
