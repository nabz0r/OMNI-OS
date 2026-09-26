import http from "node:http";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { root } from "./common.mjs";
const base = await realpath(join(root, "artifacts/docs-site"));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(
        new URL(req.url, "http://127.0.0.1").pathname,
      );
      if (path.endsWith("/")) path += "index.html";
      const file = await realpath(resolve(base, "." + path));
      if (!file.startsWith(base + "/") || !(await stat(file)).isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(3057, "127.0.0.1", () =>
    console.log("OMNI field guide: http://127.0.0.1:3057 · Ctrl+C to stop."),
  );
