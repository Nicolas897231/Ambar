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
console.log("AMBAR frontend static build ready in dist/.");
