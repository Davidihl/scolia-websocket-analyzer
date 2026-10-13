import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");

// Static files (manifest, HTML) are copied as-is into dist/.
const copyPublic = () => {
  fs.cpSync("public", "dist", { recursive: true });
};

const ctx = await esbuild.context({
  entryPoints: {
    "websocket-logger": "src/index.ts",
    options: "src/options.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: "inline",
  logLevel: "info",
  plugins: [
    {
      name: "copy-public",
      setup(build) {
        build.onEnd(copyPublic);
      },
    },
  ],
});

if (watch) {
  await ctx.watch();
  fs.watch("public", { recursive: true }, copyPublic);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
