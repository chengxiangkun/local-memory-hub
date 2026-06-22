import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.LMH_WEB_PORT || 3100);
const publicDir = path.resolve("apps/web/public");
const docsDir = path.resolve("docs");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const fullPath = resolveStaticPath(url.pathname);
    const content = await readFile(fullPath);
    res.writeHead(200, {
      "content-type": contentType(fullPath),
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Memory Hub web listening on http://127.0.0.1:${port}`);
});

function resolveStaticPath(pathname) {
  if (pathname.startsWith("/docs/")) return safeJoin(docsDir, pathname.slice("/docs/".length));
  const filePath = pathname === "/" ? "index.html" : pathname.slice(1);
  return safeJoin(publicDir, filePath);
}

function safeJoin(root, relativePath) {
  const fullPath = path.resolve(root, relativePath);
  if (!fullPath.startsWith(`${root}${path.sep}`) && fullPath !== root) {
    throw new Error("invalid_static_path");
  }
  return fullPath;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
