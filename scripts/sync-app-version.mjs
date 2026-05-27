import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const releaseConfigPath = path.join(webRoot, "apk.release.json");
const flutterPubspecPath = path.resolve(webRoot, "..", "sayittome", "pubspec.yaml");

function readReleaseConfig() {
  if (fs.existsSync(releaseConfigPath)) {
    const data = JSON.parse(fs.readFileSync(releaseConfigPath, "utf8"));
    const versionName = String(data.versionName || "").trim();
    const versionCode = Number(data.versionCode);

    if (versionName && !Number.isNaN(versionCode)) {
      return { versionName, versionCode };
    }
  }

  if (fs.existsSync(flutterPubspecPath)) {
    const raw = fs.readFileSync(flutterPubspecPath, "utf8");
    const match = raw.match(/^version:\s*([0-9.]+)\+(\d+)\s*$/m);

    if (match) {
      return {
        versionName: match[1],
        versionCode: Number(match[2]),
      };
    }
  }

  throw new Error("No se pudo leer la versión desde apk.release.json o pubspec.yaml");
}

export function writeReleaseConfig({ versionName, versionCode }) {
  fs.writeFileSync(
    releaseConfigPath,
    `${JSON.stringify({ versionName, versionCode }, null, 2)}\n`,
    "utf8",
  );
}

export function bumpReleaseVersion() {
  const current = readReleaseConfig();
  const next = {
    versionName: current.versionName,
    versionCode: current.versionCode + 1,
  };

  writeReleaseConfig(next);
  return next;
}

export function syncAppVersion({
  releasedAt = new Date().toISOString(),
  bump = false,
  apkUpdatedAt = releasedAt,
  apkSizeBytes = null,
} = {}) {
  const version = bump ? bumpReleaseVersion() : readReleaseConfig();

  const payload = {
    versionCode: version.versionCode,
    versionName: version.versionName,
    releasedAt,
    apkUpdatedAt,
    ...(apkSizeBytes ? { apkSizeBytes } : {}),
    apkUrl: "/api/download/apk",
  };

  const outPath = path.join(webRoot, "public", "app-version.json");
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return payload;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const payload = syncAppVersion();
  console.log("app-version.json actualizado:", payload);
}
