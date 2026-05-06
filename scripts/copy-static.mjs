import { cp, mkdir, copyFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await copyFile("index.html", "dist/index.html");
await copyFile("src/styles.css", "dist/styles.css");
await cp("public", "dist", { recursive: true });
