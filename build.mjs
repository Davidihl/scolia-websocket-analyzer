import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");

const copyManifest = () => {
  fs.mkdirSync("dist", { recursive: true });
  fs.copyFileSync("manifest.json", "dist/manifest.json");
};

const ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  outfile: "dist/websocket-logger.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: "inline",
  logLevel: "info",
  plugins: [
    {
      name: "copy-manifest",
      setup(build) {
        build.onEnd(copyManifest);
      },
    },
  ],
});

if (watch) {
  await ctx.watch();
  fs.watch("manifest.json", copyManifest);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
