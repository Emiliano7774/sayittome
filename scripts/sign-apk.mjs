import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(
  webRoot,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
);
const unsignedApk = path.join(releaseDir, "app-release-unsigned.apk");
const signedApk = path.join(releaseDir, "app-release.apk");
const keyPropsPath = path.resolve(webRoot, "..", "sayittome", "android", "key.properties");

function readKeyProperties() {
  const raw = fs.readFileSync(keyPropsPath, "utf8");
  const props = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^=:#\s]+)\s*=\s*(.+)$/);
    if (match) props[match[1]] = match[2].trim();
  }

  return props;
}

function findApksigner() {
  const sdkCandidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : "",
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk")
      : "",
  ].filter(Boolean);

  const sdkRoot = sdkCandidates.find((candidate) => fs.existsSync(candidate));

  if (!sdkRoot) {
    throw new Error("No se encontró el Android SDK.");
  }

  const buildToolsDir = path.join(sdkRoot, "build-tools");
  const versions = fs
    .readdirSync(buildToolsDir)
    .filter((name) => fs.existsSync(path.join(buildToolsDir, name, "apksigner.bat")))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  if (versions.length === 0) {
    throw new Error("No se encontró apksigner en build-tools.");
  }

  return path.join(buildToolsDir, versions[0], "apksigner.bat");
}

if (!fs.existsSync(unsignedApk)) {
  console.error("APK sin firmar no encontrada:", unsignedApk);
  process.exit(1);
}

if (!fs.existsSync(keyPropsPath)) {
  console.error("key.properties no encontrado:", keyPropsPath);
  process.exit(1);
}

const props = readKeyProperties();
const keystore = path.resolve(webRoot, "..", "sayittome", "android", "app", props.storeFile);
const apksigner = findApksigner();

if (fs.existsSync(signedApk)) {
  fs.unlinkSync(signedApk);
}

const result = spawnSync(
  apksigner,
  [
    "sign",
    "--ks",
    keystore,
    "--ks-key-alias",
    props.keyAlias,
    "--ks-pass",
    `pass:${props.storePassword}`,
    "--key-pass",
    `pass:${props.keyPassword}`,
    "--out",
    signedApk,
    unsignedApk,
  ],
  { stdio: "inherit", shell: true },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const verify = spawnSync(
  apksigner,
  ["verify", "--print-certs", signedApk],
  { encoding: "utf8", shell: true },
);

if (verify.status !== 0) {
  console.error(verify.stdout || verify.stderr);
  process.exit(verify.status || 1);
}

console.log("APK firmada:", signedApk);
