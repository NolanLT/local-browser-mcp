#!/usr/bin/env node
// Smoke test: spawn the built stdio server, do the MCP handshake, and assert the
// tool list is what we expect. Catches broken bundles, renamed/dropped tools, and
// stdout pollution (stdout is the JSON-RPC channel). No browser launch needed.
const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");

const EXPECTED = [
  "allow_host", "back", "click", "close_tab", "console", "dialogs", "disallow_host",
  "downloads", "eval", "fill", "forward", "get_text", "hover", "list_allowed",
  "navigate", "network", "new_tab", "press_key", "reload", "resize", "screenshot",
  "set_dialog_behavior", "snapshot", "switch_tab", "tabs", "type", "wait_for"
];

const server = path.join(__dirname, "..", "dist", "server.cjs");
const child = spawn(process.execPath, [server], { stdio: ["pipe", "pipe", "inherit"] });

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } });

let buf = "";
const timer = setTimeout(() => fail("timed out waiting for tools/list"), 20000);

function fail(msg) {
  clearTimeout(timer);
  child.kill();
  console.error("FAIL:", msg);
  process.exit(1);
}

child.stdout.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return fail(`non-JSON on stdout (stdout is the JSON-RPC channel): ${line.slice(0, 200)}`);
    }
    if (msg.id === 1) {
      const version = msg.result?.serverInfo?.version;
      assert.strictEqual(version, require("../package.json").version,
        `serverInfo.version ${version} != package.json version`);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    } else if (msg.id === 2) {
      clearTimeout(timer);
      const names = msg.result.tools.map((t) => t.name).sort();
      try {
        assert.deepStrictEqual(names, EXPECTED);
      } catch (e) {
        return fail(`tool list mismatch\n  got:      ${names.join(", ")}\n  expected: ${EXPECTED.join(", ")}`);
      }
      const prefixed = names.filter((n) => n.startsWith("browser_"));
      assert.deepStrictEqual(prefixed, [], `tools still carry the browser_ prefix: ${prefixed}`);
      console.log(`ok — ${names.length} tools, no browser_ prefix, version ${require("../package.json").version}`);
      child.kill();
      process.exit(0);
    }
  }
});

child.on("exit", (code) => fail(`server exited early (code ${code})`));
