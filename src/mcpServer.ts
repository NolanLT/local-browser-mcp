import * as http from "http";
import * as https from "https";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LocalBrowser } from "./browser";

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export interface McpServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export interface TlsOptions {
  cert: Buffer;
  key: Buffer;
}

export interface ServerHooks {
  /** Ensure the (headless) browser is running and preload the default URL. */
  onShowPanel?: () => void | Promise<void>;
  /** Ask the user (toast) to add a host to the allowlist. Returns whether granted. */
  onAllowHost?: (host: string) => Promise<boolean>;
  /** Remove a host from the allowlist (no prompt — tightening is always safe). */
  onDisallowHost?: (host: string) => Promise<void>;
  /** Ask the user (toast) to permit an eval on a non-local page. Returns whether allowed. */
  onConfirmEval?: (host: string, expression: string) => Promise<boolean>;
  /** Report an agent navigation result so the panel can show/clear an error banner. */
  onNavigated?: (url: string, ok: boolean, error?: string) => void;
  /** Surface a discrete agent action (click, type, eval, …) as a notification. */
  onActivity?: (message: string) => void;
}

function text(value: unknown) {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text: s }] };
}

function pngImage(buf: Buffer, note?: string) {
  const content: Array<
    | { type: "image"; data: string; mimeType: string }
    | { type: "text"; text: string }
  > = [{ type: "image", data: buf.toString("base64"), mimeType: "image/png" }];
  if (note) {
    content.unshift({ type: "text", text: note });
  }
  return { content };
}

export function buildServer(browser: LocalBrowser, hooks: ServerHooks = {}): McpServer {
  const server = new McpServer({
    name: "local-browser-mcp",
    version: "0.1.0"
  });

  // Surface a discrete agent action as a notification (no-op if no UI hook).
  const act = (message: string) => hooks.onActivity?.(message);

  if (hooks.onShowPanel) {
    server.tool(
      "browser_show_panel",
      "Ensure the Local Browser is running (headless) and preload the default URL. The browser has no visual panel; actions surface as VS Code notifications. Safe to call anytime.",
      {},
      async () => {
        await hooks.onShowPanel!();
        return text({ started: true });
      }
    );
  }

  server.tool(
    "browser_navigate",
    "Navigate the browser to a local dev URL (validated against the localhost allowlist).",
    { url: z.string().describe("URL to load, e.g. http://localhost:8787") },
    async ({ url }) => {
      try {
        const result = await browser.navigate(url);
        hooks.onNavigated?.(url, result.ok, result.error);
        return text(result);
      } catch (err) {
        // e.g. blocked host / invalid URL throw before navigation — return a
        // structured result and surface it in the panel too.
        const message = (err as Error).message;
        hooks.onNavigated?.(url, false, message);
        return text({ url, ok: false, error: message });
      }
    }
  );

  server.tool(
    "browser_screenshot",
    "Capture a PNG screenshot of the current page (optionally full page or a single element).",
    {
      fullPage: z.boolean().optional(),
      selector: z.string().optional()
    },
    async ({ fullPage, selector }) => {
      const buf = await browser.screenshot({ fullPage, selector });
      act(selector ? `Screenshot of ${selector}` : "Took a screenshot");
      return pngImage(buf, `Screenshot of ${browser.currentUrl}`);
    }
  );

  server.tool(
    "browser_snapshot",
    "Return a flat accessibility/DOM snapshot (tag, role, text, ref) for element targeting. Use a returned `ref` with browser_click.",
    {},
    async () => {
      const nodes = await browser.snapshot();
      act(`Snapshotted the page (${nodes.length} elements)`);
      return text(nodes);
    }
  );

  server.tool(
    "browser_click",
    "Click an element by CSS selector or by a ref from browser_snapshot.",
    {
      selector: z.string().optional(),
      ref: z.string().optional()
    },
    async ({ selector, ref }) => {
      await browser.click({ selector, ref });
      act(`Clicked ${selector ?? ref}`);
      return text({ clicked: selector ?? ref });
    }
  );

  server.tool(
    "browser_hover",
    "Hover the mouse over an element (by CSS selector or snapshot ref) — e.g. to open a dropdown menu.",
    {
      selector: z.string().optional(),
      ref: z.string().optional()
    },
    async ({ selector, ref }) => {
      await browser.hover({ selector, ref });
      act(`Hovered ${selector ?? ref}`);
      return text({ hovered: selector ?? ref });
    }
  );

  server.tool(
    "browser_fill",
    "Fill an input/textarea identified by a CSS selector with the given value.",
    {
      selector: z.string(),
      value: z.string()
    },
    async ({ selector, value }) => {
      await browser.fill(selector, value);
      act(`Filled ${selector}`);
      return text({ filled: selector });
    }
  );

  server.tool(
    "browser_type",
    "Type text using the keyboard into the currently focused element.",
    { text: z.string() },
    async ({ text: t }) => {
      await browser.type(t);
      act(`Typed ${t.length} character${t.length === 1 ? "" : "s"}`);
      return text({ typed: t.length });
    }
  );

  server.tool(
    "browser_eval",
    "Evaluate a JavaScript expression in the page context and return the JSON-serializable result. On non-local pages this prompts the user for confirmation first.",
    { expression: z.string() },
    async ({ expression }) => {
      // Gate eval on real (non-local) pages behind a user confirmation.
      if (!browser.isLocalUrl(browser.currentUrl) && hooks.onConfirmEval) {
        let host = browser.currentUrl;
        try {
          host = new URL(browser.currentUrl).hostname;
        } catch {
          /* keep raw */
        }
        const ok = await hooks.onConfirmEval(host, expression);
        if (!ok) {
          return text({ refused: true, reason: `eval on "${host}" was denied by the user` });
        }
      }
      const result = await browser.evaluate(expression);
      act("Ran JavaScript on the page");
      return text({ result });
    }
  );

  server.tool(
    "browser_console",
    "Return buffered console messages (log/warn/error) captured from the page.",
    {},
    async () => text(browser.getConsole())
  );

  server.tool(
    "browser_network",
    "Return recent network requests (method, url, status, resourceType).",
    {},
    async () => text(browser.getNetwork())
  );

  server.tool(
    "browser_wait_for",
    "Wait for a selector to become visible, for text to appear, or for a short delay.",
    {
      selector: z.string().optional(),
      text: z.string().optional(),
      timeoutMs: z.number().optional()
    },
    async ({ selector, text: t, timeoutMs }) => {
      await browser.waitFor({ selector, text: t, timeoutMs });
      return text({ ok: true });
    }
  );

  server.tool(
    "browser_resize",
    "Resize the page viewport.",
    { width: z.number(), height: z.number() },
    async ({ width, height }) => {
      await browser.resize(width, height);
      act(`Resized viewport to ${width}×${height}`);
      return text({ width, height });
    }
  );

  server.tool("browser_reload", "Reload the current page.", {}, async () => {
    await browser.reload();
    act("Reloaded the page");
    return text({ reloaded: browser.currentUrl });
  });

  server.tool("browser_back", "Navigate back in history.", {}, async () => {
    await browser.back();
    act("Went back");
    return text({ url: browser.currentUrl });
  });

  server.tool("browser_forward", "Navigate forward in history.", {}, async () => {
    await browser.forward();
    act("Went forward");
    return text({ url: browser.currentUrl });
  });

  // Stretch: quick content extraction.
  server.tool(
    "browser_get_text",
    "Return the visible text content of the page body.",
    {},
    async () => {
      const body = await browser.getText();
      act("Read the page text");
      return text(body);
    }
  );

  // --- Allowlist management ---

  server.tool(
    "browser_list_allowed",
    "List the hosts the browser may navigate to, and whether all hosts are allowed.",
    {},
    async () => text(browser.getAllowed())
  );

  server.tool(
    "browser_allow_host",
    "Request permission to add a host (e.g. \"github.com\") to the navigation allowlist. The user is asked to approve; returns whether it was granted.",
    { host: z.string().describe("Hostname to allow, e.g. github.com") },
    async ({ host }) => {
      if (hooks.onAllowHost) {
        const granted = await hooks.onAllowHost(host);
        return text({ host, granted });
      }
      // No UI hook (e.g. standalone server) — allow directly.
      browser.allowHost(host);
      return text({ host, granted: true });
    }
  );

  server.tool(
    "browser_disallow_host",
    "Remove a host from the navigation allowlist.",
    { host: z.string() },
    async ({ host }) => {
      if (hooks.onDisallowHost) {
        await hooks.onDisallowHost(host);
      } else {
        browser.disallowHost(host);
      }
      return text({ host, removed: true });
    }
  );

  return server;
}

/**
 * Start an HTTP server exposing the MCP server over SSE.
 *   GET  /sse       → open the event stream
 *   POST /messages  → client → server JSON-RPC messages (?sessionId=...)
 *   GET  /health    → liveness check
 */
export async function startMcpServer(
  browser: LocalBrowser,
  port: number,
  tls?: TlsOptions,
  hooks: ServerHooks = {}
): Promise<McpServerHandle> {
  const transports = new Map<string, SSEServerTransport>();
  const streamable = new Map<string, StreamableHTTPServerTransport>();
  const scheme = tls ? "https" : "http";

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", `${scheme}://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          engine: browser.engine,
          currentUrl: browser.currentUrl,
          endpoints: { streamableHttp: "/mcp", sse: "/sse" },
          sessions: { streamableHttp: streamable.size, sse: transports.size }
        })
      );
      return;
    }

    // Streamable HTTP transport (current MCP standard; what the Claude
    // desktop app's custom connectors expect). Single endpoint handling
    // POST (client→server + responses), GET (server→client stream), DELETE.
    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "POST") {
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        let transport = sessionId ? streamable.get(sessionId) : undefined;
        if (!transport && isInitializeRequest(body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              streamable.set(id, transport!);
            }
          });
          transport.onclose = () => {
            if (transport!.sessionId) {
              streamable.delete(transport!.sessionId);
            }
          };
          const server = buildServer(browser, hooks);
          await server.connect(transport);
        }
        if (!transport) {
          // A known session id that we no longer have (e.g. server restarted
          // under a long-lived client) → 404 so the client re-initializes, per
          // the Streamable HTTP spec. Only a genuinely missing/non-initialize
          // request with no session is a 400.
          if (sessionId) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "unknown session; re-initialize" }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "no session; expected initialize request" }));
          }
          return;
        }
        await transport.handleRequest(req, res, body);
        return;
      }

      // GET (open stream) / DELETE (terminate) require an existing session.
      const transport = sessionId ? streamable.get(sessionId) : undefined;
      if (!transport) {
        // 404 so the client knows the session is gone and re-initializes.
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Unknown Mcp-Session-Id; re-initialize");
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);
      res.on("close", () => transports.delete(transport.sessionId));
      // Each connection gets its own server instance bound to the shared browser.
      const server = buildServer(browser, hooks);
      await server.connect(transport);
      return;
    }

    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No transport for sessionId");
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  };

  const httpServer = tls
    ? https.createServer({ cert: tls.cert, key: tls.key }, handler)
    : http.createServer(handler);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    url: `${scheme}://127.0.0.1:${port}/mcp`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const t of transports.values()) {
          void t.close().catch(() => undefined);
        }
        for (const t of streamable.values()) {
          void t.close().catch(() => undefined);
        }
        transports.clear();
        streamable.clear();
        httpServer.close(() => resolve());
      })
  };
}
