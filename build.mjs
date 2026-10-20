import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");
const only = process.argv.find((arg) => arg.startsWith("--target="))?.split("=")[1];

const TARGETS = [
  { name: "chrome", esbuildTarget: "chrome120" },
  { name: "firefox", esbuildTarget: "firefox128" },
].filter((target) => !only || target.name === only);

if (TARGETS.length === 0) throw new Error(`Unknown target: ${only}`);

// Firefox MV3 has no service workers and needs an add-on ID.
const patchManifest = (manifest, target) => {
  if (target.name !== "firefox") return manifest;
  return {
    ...manifest,
    background: { scripts: [manifest.background.service_worker] },
    browser_specific_settings: {
      gecko: {
        id: "scolia-score-reader@sklera.tv",
        strict_min_version: "128.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
};

// Static files (manifest, HTML) are copied into dist/<target>/, with the manifest patched per browser.
const copyPublic = (target) => {
  const outdir = `dist/${target.name}`;
  fs.cpSync("public", outdir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync("public/manifest.json", "utf8"));
  fs.writeFileSync(`${outdir}/manifest.json`, JSON.stringify(patchManifest(manifest, target), null, 2) + "\n");
};

fs.rmSync("dist", { recursive: true, force: true });

const contexts = await Promise.all(
  TARGETS.map((target) =>
    esbuild.context({
      entryPoints: {
        "websocket-logger": "src/index.ts",
        bridge: "src/bridge.ts",
        background: "src/background.ts",
        options: "src/options.ts",
      },
      outdir: `dist/${target.name}`,
      bundle: true,
      format: "iife",
      target: target.esbuildTarget,
      sourcemap: "inline",
      // Lets page UI show the logo inline: the MAIN-world script can't load extension files.
      loader: { ".png": "dataurl" },
      logLevel: "info",
      plugins: [
        {
          name: "copy-public",
          setup(build) {
            build.onEnd(() => copyPublic(target));
          },
        },
      ],
    }),
  ),
);

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  fs.watch("public", { recursive: true }, () => TARGETS.forEach(copyPublic));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
