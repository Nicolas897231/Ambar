import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import babel from "@babel/standalone";

const root = process.cwd();
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const item of ["index.html", "Mapa de Pantallas.html", "js", "styles", "assets", "favicon.svg"]) {
  const source = join(root, item);
  if (!existsSync(source)) throw new Error(`Missing frontend asset: ${item}`);
  const target = join(dist, item);
  if (item.endsWith(".html")) copyFileSync(source, target);
  else cpSync(source, target, { recursive: true });
}

function transformJsxTree(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      transformJsxTree(path);
      continue;
    }
    if (!entry.name.endsWith(".jsx")) continue;
    const source = readFileSync(path, "utf8");
    const compiled = babel.transform(source, {
      presets: [["react", { runtime: "classic" }]],
      sourceType: "script",
      filename: entry.name,
      compact: false,
    }).code;
    writeFileSync(path.replace(/\.jsx$/, ".js"), compiled, "utf8");
    unlinkSync(path);
  }
}

transformJsxTree(join(dist, "js"));

const vendor = join(dist, "vendor");
mkdirSync(vendor, { recursive: true });
for (const [sourcePath, fileName] of [
  ["node_modules/react/umd/react.production.min.js", "react.production.min.js"],
  ["node_modules/react-dom/umd/react-dom.production.min.js", "react-dom.production.min.js"],
  ["node_modules/qrcode-generator/qrcode.js", "qrcode.js"],
]) {
  const source = join(root, sourcePath);
  if (!existsSync(source)) throw new Error(`Missing frontend vendor asset: ${sourcePath}. Run npm install in frontend.`);
  copyFileSync(source, join(vendor, fileName));
}

const indexPath = join(dist, "index.html");
let html = readFileSync(indexPath, "utf8");
html = html.replace(/\s*<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>\s*/m, "\n");
html = html.replace(/\s*<script src="vendor\/babel\.min\.js"><\/script>\s*/g, "\n");
html = html.replace(/<script type="text\/babel" src="([^"]+)\.jsx"><\/script>/g, '<script src="$1.js"></script>');
writeFileSync(indexPath, html, "utf8");

console.log("AMBAR frontend static build ready in dist/.");
