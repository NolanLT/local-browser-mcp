# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/NolanLT/local-browser-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/NolanLT/local-browser-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NolanLT/local-browser-mcp/releases/tag/v0.1.0
