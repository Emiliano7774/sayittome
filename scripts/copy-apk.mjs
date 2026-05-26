import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syncAppVersion } from "./sync-app-version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

const flutterApk = path.resolve(
  webRoot,
  "..",
  "sayittome",
  "build",
  "app",
  "outputs",
  "flutter-apk",
  "app-release.apk",
);

const destDir = path.join(webRoot, "public", "downloads");
const destApk = path.join(destDir, "sayittome.apk");

if (!fs.existsSync(flutterApk)) {
  console.error("APK no encontrado:", flutterApk);
  console.error("Ejecutá primero: flutter build apk --release");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(flutterApk, destApk);

const version = syncAppVersion({ releasedAt: new Date().toISOString() });

console.log("APK copiado a", destApk);
console.log("Versión publicada:", version);
