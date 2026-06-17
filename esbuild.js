// Bundles the stdio MCP server into a single self-contained dist/server.cjs.
// - The MCP SDK + zod are bundled in.
// - `playwright` stays external and resolves from the package's own node_modules
//   at runtime (it ships native launchers + downloads browser binaries).
// - A shebang banner makes the output directly executable as the package `bin`.
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const build = {
  entryPoints: ["src/server.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: "dist/server.cjs",
  external: ["playwright"],
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: false,
  minify: production,
  logLevel: "info"
};

async function main() {
  const ctx = await esbuild.context(build);
  if (watch) {
    await ctx.watch();
    console.log("[esbuild] watching...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
