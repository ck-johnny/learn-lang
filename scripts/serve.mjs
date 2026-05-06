import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.argv[2] ?? "dist";
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function safePath(urlPath) {
  const decodedPath = decodeURIComponent(
    new URL(urlPath, `http://${host}:${port}`).pathname,
  );
  const candidate = normalize(decodedPath).replace(/^[/\\]+/, "");
  return join(root, candidate || "index.html");
}

createServer(async (request, response) => {
  const requestedPath = safePath(request.url ?? "/");
  const filePath = (await stat(requestedPath).catch(() => null))?.isFile()
    ? requestedPath
    : join(root, "index.html");
  response.setHeader(
    "Content-Type",
    contentTypes.get(extname(filePath)) ?? "application/octet-stream",
  );
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});
