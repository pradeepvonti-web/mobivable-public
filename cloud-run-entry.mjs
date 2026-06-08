/**
 * Google Cloud Run adapter for TanStack Start / Cloudflare Workers entry.
 *
 * The Vite build outputs a Cloudflare Workers-style `fetch()` handler.
 * This file wraps it in a Node.js HTTP server for Cloud Run deployment.
 */

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Import the built server entry (Cloudflare Workers-style fetch handler)
const serverModule = await import("./dist/server/server.js");
const app = serverModule.default;

// MIME types for static assets
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".map": "application/json",
  ".txt": "text/plain",
};

// Try to serve static files from dist/client
function tryServeStatic(pathname, res) {
  const clientDir = join(__dirname, "dist", "client");
  const filePath = join(clientDir, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(clientDir)) return false;

  if (existsSync(filePath)) {
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const content = readFileSync(filePath);

    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": content.length,
      // Cache immutable assets (hashed filenames) for 1 year
      ...(pathname.includes("/assets/")
        ? { "Cache-Control": "public, max-age=31536000, immutable" }
        : { "Cache-Control": "public, max-age=3600" }),
    });
    res.end(content);
    return true;
  }
  return false;
}

// Convert Node.js IncomingMessage to Web Request
async function toWebRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["host"] || "localhost";
  const url = new URL(req.url || "/", `${protocol}://${host}`);

  const init = {
    method: req.method,
    headers: new Headers(),
  };

  // Copy headers
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      init.headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  // Read body for non-GET/HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    init.body = Buffer.concat(chunks);
  }

  return new Request(url.toString(), init);
}

// Convert Web Response to Node.js response
async function sendWebResponse(webResponse, res) {
  res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");

    // Try static files first
    if (req.method === "GET" && tryServeStatic(url.pathname, res)) {
      return;
    }

    // Fall through to SSR handler
    const webRequest = await toWebRequest(req);
    const webResponse = await app.fetch(webRequest, process.env, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });
    await sendWebResponse(webResponse, res);
  } catch (error) {
    console.error("[cloud-run] Request error:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

const PORT = parseInt(process.env.PORT || "8080", 10);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Mobivable running on http://0.0.0.0:${PORT}`);
});
