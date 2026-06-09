import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const item of ["index.html", "Mapa de Pantallas.html", "js", "styles"]) {
  const source = join(root, item);
  if (!existsSync(source)) throw new Error(`Missing frontend asset: ${item}`);
  const target = join(dist, item);
  if (item.endsWith(".html")) copyFileSync(source, target);
  else cpSync(source, target, { recursive: true });
}

const vendor = join(dist, "vendor");
mkdirSync(vendor, { recursive: true });
for (const [sourcePath, fileName] of [
  ["node_modules/react/umd/react.production.min.js", "react.production.min.js"],
  ["node_modules/react-dom/umd/react-dom.production.min.js", "react-dom.production.min.js"],
  ["node_modules/@babel/standalone/babel.min.js", "babel.min.js"],
]) {
  const source = join(root, sourcePath);
  if (!existsSync(source)) throw new Error(`Missing frontend vendor asset: ${sourcePath}. Run npm install in frontend.`);
  copyFileSync(source, join(vendor, fileName));
}

console.log("AMBAR frontend static build ready in dist/.");
