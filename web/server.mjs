import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const PORT = Number(process.env.PORT || 4173);
const ADAPTER_URL = (process.env.ADAPTER_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(process.cwd(), "dist"));
const MAX_PROXY_BODY = 60 * 1024 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function sendText(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PROXY_BODY) {
        reject(new Error("proxy request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyApi(req, res) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!["connection", "content-length", "host"].includes(name)) headers[name] = value;
  }
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const response = await fetch(`${ADAPTER_URL}${req.url}`, {
    method: req.method,
    headers,
    body,
  });
  const responseHeaders = {};
  for (const [name, value] of response.headers) {
    if (!["connection", "content-encoding", "content-length", "transfer-encoding"].includes(name)) {
      responseHeaders[name] = value;
    }
  }
  res.writeHead(response.status, responseHeaders);
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

async function serveStatic(req, res) {
  if (!DIST_DIR) {
    sendText(res, 500, "UI distribution directory is not configured.");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    sendText(res, 400, "Invalid URL.");
    return;
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.resolve(DIST_DIR, `.${requested}`);
  const insideDist = candidate === DIST_DIR || candidate.startsWith(`${DIST_DIR}${path.sep}`);
  if (!insideDist) {
    sendText(res, 403, "Forbidden.");
    return;
  }

  let filePath = candidate;
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not a file");
  } catch {
    // The UI is a single-page app; let client-side routes resolve to index.html.
    if (path.extname(requested)) {
      sendText(res, 404, "Not found.");
      return;
    }
    filePath = path.join(DIST_DIR, "index.html");
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "cache-control": path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
      "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-length": content.length,
    });
    res.end(content);
  } catch {
    sendText(res, 500, "Unable to read UI asset.");
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
    return;
  }
  const pathname = new URL(req.url, "http://localhost").pathname;
  const handler = pathname.startsWith("/api/") ? proxyApi(req, res) : serveStatic(req, res);
  handler.catch((error) => {
    console.error("[web] request failed", error);
    if (!res.headersSent) sendText(res, 502, "Local service unavailable.");
    else res.destroy();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[web] serving ${DIST_DIR} at http://127.0.0.1:${PORT}`);
  console.log(`[web] proxying /api to ${ADAPTER_URL}`);
});
