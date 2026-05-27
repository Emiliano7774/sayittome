import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const releaseConfigPath = path.join(webRoot, "apk.release.json");
const buildGradlePath = path.join(webRoot, "android", "app", "build.gradle");

function readReleaseConfig() {
  const data = JSON.parse(fs.readFileSync(releaseConfigPath, "utf8"));
  return {
    versionName: String(data.versionName),
    versionCode: Number(data.versionCode),
  };
}

const { versionName, versionCode } = readReleaseConfig();
let gradle = fs.readFileSync(buildGradlePath, "utf8");

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

fs.writeFileSync(buildGradlePath, gradle, "utf8");
console.log(`Android version sincronizada: ${versionName} (${versionCode})`);
