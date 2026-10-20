// Bundled as data URLs by esbuild (see build.mjs).
declare module "*.png" {
  const dataUrl: string;
  export default dataUrl;
}

// Compiled Tailwind CSS as a string (see build.mjs).
declare module "*.css" {
  const css: string;
  export default css;
}
