# Contributing

Thanks for your interest in improving Local Browser MCP!

## Development setup

Requires **Node.js ≥ 20**.

```bash
git clone https://github.com/NolanLT/local-browser-mcp.git
cd local-browser-mcp
npm install        # installs deps, builds dist (prepare), downloads Chromium (postinstall)
```

To skip the Chromium download during development, set `LOCAL_BROWSER_SKIP_BROWSER_DOWNLOAD=1`
before `npm install`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run build` | Bundle `src/server.ts` → `dist/server.cjs` (esbuild) |
| `npm run watch` | Rebuild on change |
| `npm test` | Smoke test: spawn `dist/server.cjs`, assert the MCP handshake and tool list |

## Project layout

```
src/
  browser.ts     Playwright wrapper: page lifecycle, allowlist, snapshot, primitives
  mcpServer.ts   MCP tool definitions (buildServer)
  server.ts      entry point — reads env, picks stdio or HTTP, wires up the browser
dist/server.cjs  bundled output (generated; not committed)
scripts/         postinstall (browser download), smoke.cjs (npm test)
plugin/          Claude Code plugin manifest + .mcp.json
```

## Smoke test

```bash
npm run build && npm test
```

It spawns the built server, completes the MCP handshake, and asserts the full tool list, the
reported version, and that stdout carries nothing but JSON-RPC. No browser binary needed. If you
add, remove, or rename a tool, update `EXPECTED` in `scripts/smoke.cjs`.

## Pull requests

1. Branch off `master`.
2. Keep changes focused; match the surrounding code style.
3. Run `npm run typecheck`, `npm run build`, and `npm test` before pushing.
4. Update `CHANGELOG.md` under `## [Unreleased]`.
5. Open a PR using the template.

## Releasing (maintainers)

This project uses [Semantic Versioning](https://semver.org/). To cut a release:

1. Move the `## [Unreleased]` notes into a new `## [x.y.z] - YYYY-MM-DD` section in `CHANGELOG.md`
   and update the compare links at the bottom.
2. Bump the version: `npm version x.y.z` (creates a commit + `vx.y.z` tag).
3. `git push && git push --tags`
4. `gh release create vx.y.z --notes-from-tag` (or paste the changelog section).
