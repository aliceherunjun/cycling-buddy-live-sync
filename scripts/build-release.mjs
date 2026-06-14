import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseDir = path.join(root, "release");
const distDir = path.join(releaseDir, "cycling-buddy-live-sync");
const zipPath = path.join(releaseDir, "cycling-buddy-live-sync.zip");

const files = [
  "README.md",
  "package.json",
  "server.js",
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "config.example.js",
  "manifest.webmanifest",
  "service-worker.js",
  "icons/icon.svg",
  ".env.example",
  "Dockerfile",
  ".dockerignore",
  "render.yaml",
  ".amap/plugin-proposal.json",
  "docs/amap-plugin-brief.md",
  "docs/plugin-prd.md",
];

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

for (const file of files) {
  const source = path.join(root, file);
  const target = path.join(distDir, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

await fs.rm(zipPath, { force: true });
await execFileAsync("zip", ["-qr", zipPath, "cycling-buddy-live-sync"], { cwd: releaseDir });

console.log(`Release package created: ${zipPath}`);
