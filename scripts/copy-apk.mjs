import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syncAppVersion } from "./sync-app-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

const apkCandidates = [
  path.join(webRoot, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
  path.join(webRoot, "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
  path.resolve(
    webRoot,
    "..",
    "sayittome",
    "build",
    "app",
    "outputs",
    "flutter-apk",
    "app-release.apk",
  ),
  path.resolve(
    webRoot,
    "..",
    "sayittome",
    "android",
    "build",
    "app",
    "outputs",
    "flutter-apk",
    "app-release.apk",
  ),
];

const sourceApk = apkCandidates.find((candidate) => fs.existsSync(candidate));
const destDir = path.join(webRoot, "public", "downloads");
const destApk = path.join(destDir, "sayittome.apk");

if (!sourceApk) {
  console.error("APK no encontrado. Rutas probadas:");
  apkCandidates.forEach((candidate) => console.error(" -", candidate));
  console.error("Ejecutá primero: npm run build:apk");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(sourceApk, destApk);

const apkStats = fs.statSync(destApk);
const releasedAt = new Date().toISOString();

const version = syncAppVersion({
  releasedAt,
  bump: process.argv.includes("--bump"),
  apkUpdatedAt: releasedAt,
  apkSizeBytes: apkStats.size,
});

console.log("APK copiado desde", sourceApk);
console.log("APK copiado a", destApk);
console.log("Versión publicada:", version);
