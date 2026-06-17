# Local Browser MCP

[![CI](https://github.com/NolanLT/local-browser-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/NolanLT/local-browser-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

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
| `LOCAL_BROWSER_HTTP_PORT` | — | If set, run in **HTTP mode** on this port (else stdio) |
| `LOCAL_BROWSER_HTTP_HOST` | `127.0.0.1` | HTTP bind address; use `0.0.0.0` for a directly-hosted box |
| `LOCAL_BROWSER_TOKEN` | — | If set, HTTP requests need `Authorization: Bearer <token>` |

## Remote / connector mode (claude.ai web & mobile, Cowork, Desktop connectors)

stdio only reaches clients on the same machine. To use this from **claude.ai** (web/mobile),
**Cowork**, or a **Desktop custom connector**, run it in **HTTP mode** and expose it over public
HTTPS — Anthropic's cloud connects to *your* endpoint, so it must be reachable and authenticated.

> ⚠️ **A public endpoint can drive a real browser, including `browser_eval`.** Always set
> `LOCAL_BROWSER_TOKEN` and keep a tight `LOCAL_BROWSER_ALLOWED_HOSTS` (and `LOCAL_BROWSER_ALLOW_ALL=false`)
> before exposing it. Without a token the HTTP path is unauthenticated.

### Quick start (tunnel)

```bash
# 1. Generate a secret and run in HTTP mode
export LOCAL_BROWSER_TOKEN=$(openssl rand -hex 32)
LOCAL_BROWSER_HTTP_PORT=3000 node dist/server.cjs
#   → [local-browser] HTTP MCP ready on http://127.0.0.1:3000/mcp

# 2. In another shell, expose it over public HTTPS (TLS terminates at the tunnel)
cloudflared tunnel --url http://127.0.0.1:3000     # or: ngrok http 3000
#   → https://something.trycloudflare.com
```

Then register the connector in claude.ai (also Desktop/Cowork):
**Customize → Connectors → "+"** → name it, enter the public **`https://…/mcp`** URL, and put your
token in the auth/Bearer field → Add → enable it per-conversation via the **"+"** in the composer.

### Production (always-on)

Host on a box that can run Chromium (VPS, Fly.io, Render, a Playwright-deps container — *not*
serverless edge, which can't spawn Chromium). Set `LOCAL_BROWSER_HTTP_HOST=0.0.0.0`, keep
`LOCAL_BROWSER_TOKEN` on, and terminate TLS at a reverse proxy (Caddy/nginx) or pass real certs.

`GET /health` is always open (no secrets) for setup checks; everything else requires the token.

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
- **In HTTP mode there is no per-call prompt** — the bearer token (`LOCAL_BROWSER_TOKEN`) is the
  gate. Set it before exposing the endpoint publicly, and keep the host allowlist tight. See
  [Remote / connector mode](#remote--connector-mode-claudeai-web--mobile-cowork-desktop-connectors).

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev/release workflow.

## Project

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

[MIT](LICENSE)
