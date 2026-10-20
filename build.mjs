import * as esbuild from "esbuild";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import fs from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");
const only = process.argv.find((arg) => arg.startsWith("--target="))?.split("=")[1];

const TARGETS = [
  { name: "chrome", esbuildTarget: "chrome120" },
  { name: "firefox", esbuildTarget: "firefox140" },
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
        // data_collection_permissions needs Firefox 140 (desktop) / 142 (Android).
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
      gecko_android: { strict_min_version: "142.0" },
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

// Tailwind CSS for all UI. Rebuilt on every (re)build, since classes are scanned from src/.
const STYLES = path.resolve("src/ui/styles.css");
const buildCss = async () => {
  const compiler = await compile(fs.readFileSync(STYLES, "utf8"), {
    base: path.dirname(STYLES),
    onDependency: () => {},
  });
  const css = compiler.build(new Scanner({ sources: compiler.sources }).scan());
  // Tailwind registers its --tw-* variables with @property and only sets fallback values for
  // browsers without it. Shadow roots ignore @property, so always apply the fallbacks.
  const fixed = css.replace(/(@layer properties\s*\{\s*@supports\s*)[^{]+\{/, "$1(display: block) {");
  if (fixed === css) throw new Error("Tailwind @property fallback not found; check build.mjs");
  return optimize(fixed, { minify: true }).code;
};

// `import css from "./x.css"` gives the compiled Tailwind CSS as a string (for shadow roots);
// the same CSS is written to options.css for the options page.
const tailwind = (target) => ({
  name: "tailwind",
  setup(build) {
    let css;
    build.onStart(async () => {
      css = await buildCss();
    });
    build.onResolve({ filter: /\.css$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: "tailwind",
    }));
    build.onLoad({ filter: /.*/, namespace: "tailwind" }, () => ({
      contents: css,
      loader: "text",
      watchFiles: [STYLES],
    }));
    build.onEnd(() => {
      fs.mkdirSync(`dist/${target.name}`, { recursive: true });
      fs.writeFileSync(`dist/${target.name}/options.css`, css);
    });
  },
});

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
        tailwind(target),
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
