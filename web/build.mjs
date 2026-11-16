// Monta a interface do Alba em web/dist (usado pela ISO e pelo servidor).
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

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

// Sleeve, o player de música do sistema (github.com/paulocmarinho/sleeve).
// A interface dele vem sem etapa de build: copiamos src/web e trocamos a ponte pela do Alba.
const sleeve = process.env.SLEEVE_DIR || "sleeve-src";
if (existsSync(`${sleeve}/src/web/app.js`)) {
  cpSync(`${sleeve}/src/web`, "dist/apps/sleeve", { recursive: true });
  cpSync("sleeve/bridge.js", "dist/apps/sleeve/bridge.js");
  rmSync("dist/apps/sleeve/demo.js", { force: true });
  cpSync(`${sleeve}/assets/marca/sleeve-icone.svg`, "dist/apps/sleeve/icone.svg");
  console.log("Sleeve incluído em dist/apps/sleeve");
} else {
  console.warn(`Aviso: Sleeve não encontrado em ${sleeve} (defina SLEEVE_DIR). O app de música ficará indisponível.`);
}
