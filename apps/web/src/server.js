import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.LMH_WEB_PORT || 3100);
const publicDir = path.resolve("apps/web/public");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const filePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const fullPath = path.join(publicDir, filePath);
    const content = await readFile(fullPath);
    res.writeHead(200, {
      "content-type": contentType(fullPath)
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

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
