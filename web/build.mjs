// Monta a interface do Alba em web/dist (usado pela ISO e pelo servidor).
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const dev = process.argv.includes("--dev");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  outdir: "dist",
  jsx: "automatic",
  minify: !dev,
  sourcemap: dev,
  target: ["chrome110"],
  loader: { ".svg": "file", ".png": "file" },
  external: ["./fonts/*"],
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
  logLevel: "info",
});
cpSync("public", "dist", { recursive: true });
