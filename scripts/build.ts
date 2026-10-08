import { build as bundle } from "esbuild";
import { build as vite } from "vite";
import { readFile, mkdir, cp } from "node:fs/promises";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("dist", { recursive: true });
await vite({
  root: "apps/web",
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
await bundle({
  entryPoints: ["apps/server/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: "dist/server.mjs",
  external: Object.keys(pkg.dependencies),
  sourcemap: false,
});
await cp("packages/api-library/source", "dist/api-source", { recursive: true });
console.log("Built Sona web and local server.");
