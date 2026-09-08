/**
 * Local Browser MCP server — a headless Playwright browser driven over MCP.
 *
 * This process owns the browser directly: it launches on the first tool call and
 * is torn down when the process exits, so the browser's lifetime is the session's.
 *
 * Two transports, selected at runtime by env:
 *   - Default (no LOCAL_BROWSER_HTTP_PORT): stdio — for local MCP clients that
 *     spawn the server themselves (Claude Code, Claude Desktop) via .mcp.json.
 *   - LOCAL_BROWSER_HTTP_PORT set: Streamable HTTP at /mcp — for clients that
 *     connect to a URL instead (claude.ai web/mobile, custom connectors), reached
 *     over public HTTPS via a tunnel or reverse proxy.
 *
 * Configuration is via environment variables:
 *   LOCAL_BROWSER_ENGINE         chromium | firefox | webkit   (default chromium)
 *   LOCAL_BROWSER_ALLOWED_HOSTS  comma-separated host allowlist (default localhost,127.0.0.1)
 *   LOCAL_BROWSER_ALLOW_ALL      "true" to allow any http/https host (default false)
 *   LOCAL_BROWSER_HTTP_PORT      if set, run HTTP mode on this port (else stdio)
 *   LOCAL_BROWSER_HTTP_HOST      HTTP bind address (default 127.0.0.1; "0.0.0.0" for a public box)
 *   LOCAL_BROWSER_TOKEN          if set, HTTP requests need `Authorization: Bearer <token>`
 *   LOCAL_BROWSER_DOWNLOAD_DIR   where downloads are saved (default <tmp>/local-browser-downloads)
 *
 * There is no GUI and no approval dialog. Over stdio the gate is the client's own
 * per-tool permission prompt; over HTTP it's the bearer token, so set
 * LOCAL_BROWSER_TOKEN before any public exposure.
 *
 * IMPORTANT: in stdio mode, stdout is the JSON-RPC channel. Never write to
 * stdout; all diagnostics go to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LocalBrowser, Engine } from "./browser";
import { buildServer, startMcpServer } from "./mcpServer";

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
    allowAllHosts: /^(1|true|yes)$/i.test(process.env.LOCAL_BROWSER_ALLOW_ALL ?? ""),
    downloadDir: process.env.LOCAL_BROWSER_DOWNLOAD_DIR || undefined
  });

  const httpPort = process.env.LOCAL_BROWSER_HTTP_PORT;

  if (httpPort) {
    // ---- Remote / connector mode: Streamable HTTP at /mcp ----
    const handle = await startMcpServer(browser, Number(httpPort), {
      host: process.env.LOCAL_BROWSER_HTTP_HOST ?? "127.0.0.1",
      bearerToken: process.env.LOCAL_BROWSER_TOKEN
    });

    let httpShuttingDown = false;
    const shutdownHttp = async () => {
      if (httpShuttingDown) {
        return;
      }
      httpShuttingDown = true;
      try {
        await handle.close();
      } catch {
        /* ignore */
      }
      try {
        await browser.dispose();
      } catch {
        /* ignore */
      }
      process.exit(0);
    };
    process.on("SIGINT", shutdownHttp);
    process.on("SIGTERM", shutdownHttp);

    if (!process.env.LOCAL_BROWSER_TOKEN) {
      console.error(
        "[local-browser] WARNING: no LOCAL_BROWSER_TOKEN set — the HTTP endpoint is unauthenticated. Set a token before any public exposure."
      );
    }
    console.error(`[local-browser] HTTP MCP ready on ${handle.url}`);
    return;
  }

  // ---- Default: stdio mode (Claude Code / Desktop). ----
  // Headless: gating is the client's own per-tool permission prompts.
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

  console.error("[local-browser] MCP server ready (stdio, headless).");
}

main().catch((err) => {
  console.error("[local-browser] fatal:", err);
  process.exit(1);
});
