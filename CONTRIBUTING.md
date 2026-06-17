# Contributing

Thanks for your interest in improving Local Browser MCP!

## Development setup

Requires **Node.js ≥ 18**.

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

## Project layout

```
src/
  browser.ts     Playwright wrapper: page lifecycle, allowlist, snapshot, primitives
  mcpServer.ts   MCP tool definitions (buildServer)
  server.ts      stdio entry point — wires the browser to the MCP server
dist/server.cjs  bundled output (generated; not committed)
scripts/         postinstall (browser download)
plugin/          Claude Code plugin manifest + .mcp.json
```

## Smoke test

```bash
npm run build
# pipe an MCP initialize + tools/list to the server over stdio:
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/server.cjs
```

## Pull requests

1. Branch off `master`.
2. Keep changes focused; match the surrounding code style.
3. Run `npm run typecheck` and `npm run build` before pushing.
4. Update `CHANGELOG.md` under `## [Unreleased]`.
5. Open a PR using the template.

## Releasing (maintainers)

This project uses [Semantic Versioning](https://semver.org/). To cut a release:

1. Move the `## [Unreleased]` notes into a new `## [x.y.z] - YYYY-MM-DD` section in `CHANGELOG.md`
   and update the compare links at the bottom.
2. Bump the version: `npm version x.y.z` (creates a commit + `vx.y.z` tag).
3. `git push && git push --tags`
4. `gh release create vx.y.z --notes-from-tag` (or paste the changelog section).
