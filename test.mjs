import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

// Bundles each test/*.test.ts (with its src/ and demo-data/ imports) and runs node --test.
const entryPoints = fs
  .readdirSync("test")
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => `test/${file}`);

fs.rmSync(".test-build", { recursive: true, force: true });
await esbuild.build({
  entryPoints,
  outdir: ".test-build",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "inline",
  external: ["node:*"],
  loader: { ".png": "dataurl" },
});

const files = fs.readdirSync(".test-build").map((file) => `.test-build/${file}`);
const { status } = spawnSync(process.execPath, ["--enable-source-maps", "--test", ...files], {
  stdio: "inherit",
});
process.exit(status ?? 1);
