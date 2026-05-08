import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const root = resolve("dist");
const preferredPort = Number(process.env.PORT ?? 4173);
let port = preferredPort;
const host = process.env.HOST ?? "0.0.0.0";
const watchTargets = ["src", "public", "index.html", "tsconfig.json"];
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);
const liveReloadClient = `
<script>
(() => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(protocol + "//" + location.host + "/__live_reload");
  socket.addEventListener("message", (event) => {
    if (event.data === "reload") location.reload();
  });
})();
</script>`;
const clients = new Set();

let rebuildTimer = null;
let isBuilding = false;
let shouldRebuildAgain = false;

function isInsideRoot(filePath) {
  const relative = filePath.slice(root.length);
  return filePath === root || relative.startsWith(sep);
}

function safePath(urlPath) {
  const pathname = new URL(urlPath, `http://${host}:${port}`).pathname;
  const requestedPath = resolve(root, decodeURIComponent(pathname).replace(/^[/\\]+/, ""));
  return isInsideRoot(requestedPath) ? requestedPath : join(root, "index.html");
}

function sendLiveReload() {
  for (const client of clients) {
    client.write(encodeWebSocketFrame("reload"));
  }
}

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message);
  if (payload.length > 125) {
    throw new Error("Live reload message is too long.");
  }

  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function handleWebSocketUpgrade(request, socket) {
  if (new URL(request.url ?? "/", `http://${host}:${port}`).pathname !== "/__live_reload") {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );
  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
}

async function build() {
  if (isBuilding) {
    shouldRebuildAgain = true;
    return;
  }

  isBuilding = true;
  shouldRebuildAgain = false;
  console.log("Building...");

  const exitCode = await new Promise((resolveBuild) => {
    const child = spawn("npm", ["run", "build"], { stdio: "inherit" });
    child.on("close", resolveBuild);
  });

  isBuilding = false;

  if (exitCode === 0) {
    console.log("Built. Reloading browser...");
    sendLiveReload();
  } else {
    console.error("Build failed. Fix the error and save again.");
  }

  if (shouldRebuildAgain) {
    await build();
  }
}

function scheduleBuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(build, 120);
}

async function watchPath(target) {
  const targetPath = resolve(target);
  const targetStat = await stat(targetPath);

  if (targetStat.isDirectory()) {
    watch(targetPath, { recursive: true }, scheduleBuild);
    return;
  }

  watch(targetPath, scheduleBuild);
}

async function getFilePath(requestedPath) {
  const fileStat = await stat(requestedPath).catch(() => null);
  return fileStat?.isFile() ? requestedPath : join(root, "index.html");
}

const server = createServer(async (request, response) => {
  const filePath = await getFilePath(safePath(request.url ?? "/"));
  const contentType = contentTypes.get(extname(filePath)) ?? "application/octet-stream";
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", contentType);

  if (extname(filePath) !== ".html") {
    createReadStream(filePath).pipe(response);
    return;
  }

  const chunks = [];
  for await (const chunk of createReadStream(filePath)) {
    chunks.push(chunk);
  }
  response.end(
    Buffer.concat(chunks)
      .toString("utf8")
      .replace("</body>", `${liveReloadClient}</body>`),
  );
});

server.on("upgrade", handleWebSocketUpgrade);

async function listen() {
  for (let offset = 0; offset < 10; offset += 1) {
    port = preferredPort + offset;
    const didListen = await new Promise((resolveListen, rejectListen) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE") {
          resolveListen(false);
          return;
        }
        rejectListen(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolveListen(true);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });

    if (didListen) {
      return;
    }
  }

  throw new Error(
    `No available dev server port found from ${preferredPort} to ${
      preferredPort + 9
    }.`,
  );
}

await build();
await readdir(root);
await Promise.all(watchTargets.map(watchPath));
await listen();

console.log(`Serving ${root} at http://${host}:${port}`);
console.log("Watching for changes...");
