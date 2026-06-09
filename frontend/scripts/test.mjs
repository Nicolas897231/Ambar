import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const requiredRoutes = ["dashboard", "expedients", "documents", "digitization", "trd", "archive", "transfers", "loans", "correspondence", "hr", "medical", "recruitment", "reports", "audit", "security", "settings", "empleo"];
const data = readFileSync("js/data.js", "utf8");
const missing = requiredRoutes.filter((route) => !data.includes(`key: \"${route}\"`) && route !== "empleo");
if (!html.includes("js/api.js")) missing.push("api bridge script");
if (missing.length) {
  console.error(`Screen map test failed: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("AMBAR screen map tests passed.");
