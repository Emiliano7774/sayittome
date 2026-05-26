import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const flutterRoot = path.resolve(webRoot, "..", "sayittome");
const pubspecPath = path.join(flutterRoot, "pubspec.yaml");

function readPubspecVersion() {
  const raw = fs.readFileSync(pubspecPath, "utf8");
  const match = raw.match(/^version:\s*([0-9.]+)\+(\d+)\s*$/m);

  if (!match) {
    throw new Error("No se pudo leer version: x.y.z+code desde pubspec.yaml");
  }

  return {
    versionName: match[1],
    versionCode: Number(match[2]),
  };
}

export function syncAppVersion({ releasedAt = new Date().toISOString() } = {}) {
  const { versionName, versionCode } = readPubspecVersion();

  const payload = {
    versionCode,
    versionName,
    releasedAt,
    apkUrl: "/downloads/sayittome.apk",
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
