import { build } from "esbuild";
import { glob } from "glob";

const entryPoints = await glob("src/**/*.ts");

await build({
  entryPoints,
  platform: "node",
  target: "node18",
  format: "cjs",
  outdir: "dist",
  sourcemap: true,
  logLevel: "info",
});
