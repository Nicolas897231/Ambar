import { existsSync } from "node:fs";

const required = [
  "index.html",
  "js/api.js",
  "js/app.jsx",
  "js/auth.jsx",
  "js/shell.jsx",
  "js/modules/dashboard.jsx",
  "js/modules/documents.jsx",
  "js/modules/expedients.jsx",
  "js/modules/trd.jsx",
  "js/modules/archive.jsx",
  "js/modules/transfers.jsx",
  "js/modules/loans.jsx",
  "js/modules/hr.jsx",
  "js/modules/recruitment.jsx",
  "js/modules/portal.jsx",
  "styles/tokens.css",
  "styles/shell.css",
  "styles/modules.css"
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(`Missing required frontend files:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log("AMBAR frontend lint checks passed.");
