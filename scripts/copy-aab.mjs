import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syncAppVersion } from "./sync-app-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

const aabCandidates = [
  path.join(webRoot, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab"),
  path.join(
    webRoot,
    "android",
    "app",
    "build",
    "outputs",
    "bundle",
    "release",
    "app-release-signed.aab",
  ),
];

const sourceAab = aabCandidates.find((candidate) => fs.existsSync(candidate));
const destDir = path.join(webRoot, "public", "downloads");
const destAab = path.join(destDir, "sayittome.aab");

if (!sourceAab) {
  console.error("AAB no encontrado. Rutas probadas:");
  aabCandidates.forEach((candidate) => console.error(" -", candidate));
  console.error("Ejecutá primero: npm run build:aab");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(sourceAab, destAab);

const aabStats = fs.statSync(destAab);
const releasedAt = new Date().toISOString();

const version = syncAppVersion({
  releasedAt,
  bump: process.argv.includes("--bump"),
  apkUpdatedAt: releasedAt,
  apkSizeBytes: aabStats.size,
});

console.log("AAB copiado desde", sourceAab);
console.log("AAB copiado a", destAab);
console.log("Versión publicada:", version);
