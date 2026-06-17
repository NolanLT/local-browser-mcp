/**
 * Standalone Local Browser MCP server — no VS Code required.
 *
 * This is the "baked into Claude" build: Claude Code spawns this process as a
 * plugin MCP server (stdio), and it owns a headless Playwright browser directly.
 * Same browser + same tools as the VS Code extension, minus the extension host,
 * the HTTP server, the port, and the bridge hop. The browser's lifecycle is tied
 * to this process, so it starts when Claude connects and is torn down on exit.
 *
 * Configuration is via environment variables (set in the plugin's .mcp.json):
 *   LOCAL_BROWSER_ENGINE         chromium | firefox | webkit   (default chromium)
 *   LOCAL_BROWSER_ALLOWED_HOSTS  comma-separated host allowlist (default localhost,127.0.0.1)
 *   LOCAL_BROWSER_ALLOW_ALL      "true" to allow any http/https host (default false)
 *
 * There is no GUI here, so the VS Code confirmation toasts (allow-host,
 * confirm-eval) are not wired — those gates fall back to Claude Code's own
 * per-tool permission prompts, which already ask the user before a call runs.
 *
 * IMPORTANT: stdio is the JSON-RPC channel. Never write to stdout; all
 * diagnostics go to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LocalBrowser, Engine } from "./browser";
import { buildServer } from "./mcpServer";

function parseHosts(raw?: string): string[] {
  return (raw ?? "localhost,127.0.0.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEngine(raw?: string): Engine {
  return raw === "firefox" || raw === "webkit" ? raw : "chromium";
}

async function main(): Promise<void> {
  const browser = new LocalBrowser({
    engine: parseEngine(process.env.LOCAL_BROWSER_ENGINE),
    allowedHosts: parseHosts(process.env.LOCAL_BROWSER_ALLOWED_HOSTS),
    allowAllHosts: /^(1|true|yes)$/i.test(process.env.LOCAL_BROWSER_ALLOW_ALL ?? "")
  });

  // No hooks: headless + standalone, gating handled by Claude Code permissions.
  const server = buildServer(browser);
  await server.connect(new StdioServerTransport());

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await browser.dispose();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // When Claude closes the stdio pipe, exit so we don't leave a browser running.
  process.stdin.on("close", shutdown);

  console.error("[local-browser] standalone MCP server ready (headless).");
}

main().catch((err) => {
  console.error("[local-browser] fatal:", err);
  process.exit(1);
});
