import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT || 3000);
const root = join(process.cwd(), existsSync(join(process.cwd(), "dist", "index.html")) ? "dist" : ".");
const apiTarget = (process.env.API_PROXY_TARGET || process.env.AMBAR_API_ORIGIN || "http://api:8000").replace(/\/$/, "");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, secureHeaders(headers));
  res.end(body);
}

function secureHeaders(headers = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "x-permitted-cross-domain-policies": "none",
    "x-dns-prefetch-control": "off",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    ...headers,
  };
}

async function proxyApi(req, res) {
  const target = new URL(req.url, apiTarget);
  const headers = { ...req.headers };
  const requestId = req.headers["x-request-id"] || randomUUID();
  delete headers.host;
  delete headers["accept-encoding"];
  headers["x-request-id"] = requestId;
  headers["accept-encoding"] = "identity";
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : req,
      duplex: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : "half",
      redirect: "manual"
    });
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      const normalized = key.toLowerCase();
      if (!["connection", "transfer-encoding", "set-cookie", "content-encoding", "content-length"].includes(normalized)) {
        responseHeaders[key] = value;
      }
    });
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
    if (!setCookies.length) {
      const combined = response.headers.get("set-cookie");
      if (combined) setCookies.push(...combined.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()));
    }
    if (setCookies.length) responseHeaders["set-cookie"] = setCookies;
    res.writeHead(response.status, secureHeaders(responseHeaders));
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (error) {
    send(res, 502, JSON.stringify({ detail: "API gateway unavailable" }), { "content-type": "application/json" });
  }
}

function safePath(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const normalized = normalize(clean).replace(/^([/\\])+/, "");
  if (normalized.includes("..")) return null;
  return join(root, normalized || "index.html");
}

async function serveIndex(res) {
  const html = await readFile(join(root, "index.html"));
  res.writeHead(200, secureHeaders({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }));
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return send(res, 400, "Bad request");
  if (req.url.startsWith("/api/v1/")) return proxyApi(req, res);
  if (req.url === "/health" || req.url === "/health/") return send(res, 200, JSON.stringify({ status: "ok", service: "ambar-web" }), { "content-type": "application/json" });
  if (req.url === "/vendor/qrcode.js" && !existsSync(join(root, "vendor", "qrcode.js"))) {
    const qrPath = join(process.cwd(), "node_modules", "qrcode-generator", "qrcode.js");
    if (existsSync(qrPath)) {
      res.writeHead(200, secureHeaders({ "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" }));
      createReadStream(qrPath).pipe(res);
      return;
    }
  }
  if (req.url === "/robots.txt") return send(res, 200, "User-agent: *\nDisallow: /api/\nDisallow: /health\nDisallow: /metrics\n", { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" });
  if (req.url === "/.well-known/security.txt") return send(res, 200, "Contact: security@ambar.co\nExpires: 2027-01-01T00:00:00.000Z\nPreferred-Languages: es, en\nPolicy: https://ambar.co/security\n", { "content-type": "text/plain; charset=utf-8" });

  const filePath = safePath(req.url);
  if (!filePath) return send(res, 403, "Forbidden");
  // Block source maps and hidden files regardless of whether they exist on disk.
  const ext = extname(filePath).toLowerCase();
  if (ext === ".map" || filePath.includes("/.")) return send(res, 404, "Not Found");
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const type = mime[extname(filePath).toLowerCase()] || "application/octet-stream";
    const immutableAsset = filePath.includes(`${root}\\vendor`) || filePath.includes(`${root}/vendor`) || filePath.includes(`${root}\\assets`) || filePath.includes(`${root}/assets`) || ext === ".svg";
    const cache = immutableAsset ? { "cache-control": "public, max-age=31536000, immutable" } : { "cache-control": "no-cache" };
    res.writeHead(200, secureHeaders({ "content-type": type, ...cache }));
    createReadStream(filePath).pipe(res);
    return;
  }
  return serveIndex(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AMBAR frontend running on ${port}; API proxy -> ${apiTarget}`);
});
