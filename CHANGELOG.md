# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-09-08

### Removed
- The `ServerHooks` machinery and the `show_panel` tool — leftovers from the VS Code extension this
  package replaced. Nothing in this repo ever passed hooks, so every branch on them was dead: the
  activity-notification calls, the panel error banner, the allow-host and eval confirmation
  prompts, and `LocalBrowser.isLocalUrl` / `LOCAL_HOSTS` / `setAllowedHosts` / `setAllowAllHosts`.
  `buildServer(browser)` now takes one argument. Tool behavior is unchanged (the gate was already
  the client's own per-tool approval); the tool list drops from 28 to 27 by losing `show_panel`,
  which was only ever registered when hooks were supplied.

### Changed
- **BREAKING — tool names dropped the `browser_` prefix.** MCP already namespaces tools under the
  server name, so `local-browser: browser_navigate` was saying "browser" twice. All 27 tools were
  renamed: `browser_navigate` → `navigate`, `browser_click` → `click`, `browser_eval` → `eval`,
  and so on. No aliases are kept — update any saved prompts, permission rules, or hooks that name
  the old tools.
- **Node.js ≥ 20 is now required** (was ≥ 20 in practice already: Playwright dropped Node 18, so
  the declared `>=18` floor was untrue). CI now builds on Node 20/22/24.
- Dependency bumps: playwright 1.63, esbuild 0.28.2, zod 4.5.4.

### Fixed
- The MCP handshake reported a hardcoded `version: "0.1.0"`; it now reports the real package
  version, injected at build time.
- The "blocked host" error pointed at `localBrowser.allowAllHosts`, a VS Code setting that does
  not exist here — it now names `LOCAL_BROWSER_ALLOW_ALL`.
- Patched transitive advisories in `fast-uri` (SSRF / host confusion, high) and `qs` (array-limit
  bypass, DoS). `npm audit` is clean.

### Added
- `npm test` — a dependency-free smoke test that spawns the built server, completes the MCP
  handshake, and asserts the full tool list, the reported version, and that stdout carries only
  JSON-RPC. Runs in CI.
- Dependabot config for weekly npm and GitHub Actions updates.

### Docs
- README, CONTRIBUTING, and the plugin/marketplace descriptions no longer define this package by
  what it is not ("no VS Code required"), and CONTRIBUTING's hand-rolled JSON-RPC smoke-test
  snippet is replaced by `npm test`.

## [0.3.0] - 2026-08-04

### Added
- **Tabs & popups.** `browser_tabs`, `browser_new_tab`, `browser_switch_tab`, `browser_close_tab`.
  Popups and `target=_blank` links are auto-tracked and become the active tab.
- **`browser_press_key`** — press a key or chord (Enter, Tab, Escape, ArrowDown, Control+A, …),
  e.g. to submit a form without a mouse.
- **Dialog handling.** JS dialogs (alert/confirm/prompt) are auto-handled so pages never hang;
  `browser_dialogs` lists them and `browser_set_dialog_behavior` switches accept/dismiss
  (beforeunload is always dismissed).
- **Downloads.** Files are captured to a download directory (`LOCAL_BROWSER_DOWNLOAD_DIR`,
  default `<tmp>/local-browser-downloads`); `browser_downloads` lists them.
- **Screenshot format.** `browser_screenshot` accepts `format: "jpeg"` and `quality` (1-100) for
  lighter, faster captures; PNG remains the default.

### Changed
- Dependency updates: `@modelcontextprotocol/sdk` ^1.30, `zod` ^4, `playwright` ^1.62,
  `esbuild` ^0.28, `@types/node` ^22. TypeScript held at ^5.5 (TS 7 deferred).

### Security
- Patched transitive dependencies flagged by Dependabot (all pulled in via
  `@modelcontextprotocol/sdk`): `hono` 4.13.0, `@hono/node-server` 2.1.0, `fast-uri` 3.1.5,
  `ip-address` 10.4.0. `npm audit` now reports 0 vulnerabilities. Note: the SDK's Hono HTTP
  server and rate-limiter are not on this package's code path (HTTP mode uses its own server),
  but the dependencies are patched regardless.

## [0.2.0] - 2026-06-17

### Added
- **HTTP / connector mode.** Set `LOCAL_BROWSER_HTTP_PORT` to serve the same tools over
  Streamable HTTP at `/mcp` (for claude.ai web/mobile, Cowork, and Desktop custom connectors)
  instead of stdio. `LOCAL_BROWSER_HTTP_HOST` sets the bind address (default `127.0.0.1`).
- **Bearer-token authentication** for the HTTP path via `LOCAL_BROWSER_TOKEN` — every request
  except `GET /health` must send `Authorization: Bearer <token>` when set. Required before any
  public exposure.

### Changed
- `startMcpServer(browser, port, opts)` now takes an options object (`host`, `tls`, `bearerToken`,
  `hooks`) instead of positional `tls`/`hooks` args.
- Default (no `LOCAL_BROWSER_HTTP_PORT`) behavior is unchanged: stdio mode for Claude Code / Desktop.

## [0.1.0] - 2026-06-16

Initial release — a headless, agent-controllable real browser as a stdio MCP server.
No VS Code required.

### Added
- **Headless Playwright browser over MCP (stdio).** Launches on first tool call, torn down
  when the client closes the connection.
- **Tools:** `browser_navigate`, `browser_screenshot`, `browser_snapshot`, `browser_click`,
  `browser_hover`, `browser_fill`, `browser_type`, `browser_eval`, `browser_console`,
  `browser_network`, `browser_wait_for`, `browser_resize`, `browser_reload`, `browser_back`,
  `browser_forward`, `browser_get_text`, `browser_allow_host`, `browser_disallow_host`,
  `browser_list_allowed`.
- **Configuration via environment variables:** `LOCAL_BROWSER_ENGINE`,
  `LOCAL_BROWSER_ALLOWED_HOSTS`, `LOCAL_BROWSER_ALLOW_ALL`, `LOCAL_BROWSER_SKIP_BROWSER_DOWNLOAD`.
- **Per-domain allowlist** (defaults to `localhost`/`127.0.0.1`) enforced on every navigation.
- **Ephemeral browser profile** — no saved cookies, logins, or passwords.
- **Install straight from GitHub** with no npm registry: `npx -y github:NolanLT/local-browser-mcp`.
- **Claude Code plugin marketplace** (`/plugin marketplace add NolanLT/local-browser-mcp`).
- Chromium binary downloaded automatically on install (`postinstall`), skippable via env.

[Unreleased]: https://github.com/NolanLT/local-browser-mcp/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/NolanLT/local-browser-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/NolanLT/local-browser-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/NolanLT/local-browser-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NolanLT/local-browser-mcp/releases/tag/v0.1.0
