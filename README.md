# Local Browser MCP

A **headless, agent-controllable real browser** as an [MCP](https://modelcontextprotocol.io)
server. It gives an AI agent (Claude Code, or any MCP client) a real Playwright browser pointed at
your **local dev servers** — and any hosts you explicitly allow — with **no VS Code and no GUI
required**. The agent launches the browser, drives it, and it's torn down when the session ends.

Navigate, click, hover, fill, type, run JS, screenshot, snapshot the DOM, and read console/network
— all over MCP. Because it normally only drives *your own localhost*, it's given broad control
without general-web-browsing risk; additional hosts are opt-in.

## Install

Requires **Node.js ≥ 18**. The Chromium binary (~110 MB) is downloaded automatically on first
install.

### Claude Code / any MCP client (recommended)

Add it to your MCP config (e.g. a project `.mcp.json`, your user config via
`claude mcp add`, or your client's equivalent). `npx` runs it straight from this GitHub repo —
**no npm registry account needed** (requires `git` on the machine):

```jsonc
{
  "mcpServers": {
    "local-browser": {
      "command": "npx",
      "args": ["-y", "github:NolanLT/local-browser-mcp"],
      "env": {
        "LOCAL_BROWSER_ALLOWED_HOSTS": "localhost,127.0.0.1"
      }
    }
  }
}
```

Restart your client. The `browser_*` tools appear with no other setup. (First run installs
dependencies and downloads Chromium, then caches.)

> If the package is also published to npm, you can swap the arg for the shorter
> `["-y", "local-browser-mcp"]`.

### As a Claude Code plugin (GitHub marketplace)

```
/plugin marketplace add NolanLT/local-browser-mcp
/plugin install local-browser@local-browser-marketplace
```

The plugin's MCP server is the same `npx` invocation above.

## Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `LOCAL_BROWSER_ENGINE` | `chromium` | `chromium` (recommended) \| `firefox` \| `webkit` |
| `LOCAL_BROWSER_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated navigation allowlist |
| `LOCAL_BROWSER_ALLOW_ALL` | `false` | `true` allows **any** http/https host (see Security) |
| `LOCAL_BROWSER_SKIP_BROWSER_DOWNLOAD` | — | `1` to skip the Chromium download on install |

## Tools

| Tool | Purpose |
|------|---------|
| `browser_navigate({ url })` | Go to a URL (allowlist-validated) |
| `browser_screenshot({ fullPage?, selector? })` | PNG returned to the agent |
| `browser_snapshot()` | Flat DOM/a11y snapshot `{ tag, role, text, ref }` |
| `browser_click({ selector \| ref })` | Click an element |
| `browser_hover({ selector \| ref })` | Hover (e.g. open a dropdown) |
| `browser_fill({ selector, value })` | Fill an input |
| `browser_type({ text })` | Type into the focused element |
| `browser_eval({ expression })` | Run JS in the page, return JSON result |
| `browser_console()` / `browser_network()` | Buffered console / recent requests |
| `browser_wait_for({ selector?, text?, timeoutMs? })` | Wait for a condition |
| `browser_resize({ width, height })` | Resize the viewport |
| `browser_reload()` / `browser_back()` / `browser_forward()` | History nav |
| `browser_get_text()` | Visible page text |
| `browser_allow_host` / `browser_disallow_host` / `browser_list_allowed` | Allowlist management |

`ref` values come from `browser_snapshot()` (elements are tagged with `data-lbmcp-ref`), so
`browser_click({ ref })` targets them reliably.

## Security

- Navigation is rejected unless the host is in `LOCAL_BROWSER_ALLOWED_HOSTS` (or `ALLOW_ALL` is on)
  and the protocol is http/https.
- The browser uses a **fresh, ephemeral profile** — no saved cookies, logins, or passwords.
- `browser_eval` runs arbitrary JS with the page's full privileges. Harmless on your own dev site;
  powerful on a real one. With `ALLOW_ALL` on, every visited page is untrusted input (prompt-
  injection surface) and the agent can script it — keep `ALLOW_ALL` off unless you mean it.
- There's no built-in approval dialog (the server is headless). When run under Claude Code, host
  additions and eval calls are gated by Claude Code's own per-tool permission prompts.

## Develop

```bash
npm install        # installs deps + downloads Chromium
npm run typecheck  # tsc --noEmit
npm run build      # bundle → dist/server.cjs
```

Run it directly for a stdio smoke test:

```bash
node dist/server.cjs
```

## License

MIT
