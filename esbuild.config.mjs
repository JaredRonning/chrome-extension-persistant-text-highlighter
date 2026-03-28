import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const options = {
  entryPoints: [
    "src/popup/popup.ts",
    "src/content/content.ts",
    "src/background/background.ts",
  ],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  logLevel: "info",
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(options);
}
