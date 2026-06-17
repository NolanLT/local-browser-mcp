#!/usr/bin/env node
// Download the Chromium browser binary that the MCP server drives. Runs after
// `npm install` / `npx`. Failures are non-fatal so a flaky download doesn't break
// the whole install — the server prints a clear hint if the binary is missing.
//
// Skip with: LOCAL_BROWSER_SKIP_BROWSER_DOWNLOAD=1  (or Playwright's own
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
const { spawnSync } = require("child_process");
const path = require("path");

if (
  process.env.LOCAL_BROWSER_SKIP_BROWSER_DOWNLOAD ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
) {
  console.error("[local-browser-mcp] Skipping Chromium download (env opt-out).");
  process.exit(0);
}

// Resolve Playwright's CLI without tripping its package `exports` map (which can
// block require.resolve("playwright/cli.js") on newer versions). package.json is
// always resolvable, and cli.js sits next to it.
let cli;
try {
  cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
} catch {
  console.error(
    "[local-browser-mcp] Could not locate Playwright; run `npx playwright install chromium` manually."
  );
  process.exit(0);
}

const engine = process.env.LOCAL_BROWSER_ENGINE || "chromium";
const res = spawnSync(process.execPath, [cli, "install", engine], { stdio: "inherit" });
if (res.status !== 0) {
  console.error(
    `[local-browser-mcp] Browser download did not complete (exit ${res.status}). ` +
      `Run \`npx playwright install ${engine}\` manually before first use.`
  );
}
process.exit(0);
