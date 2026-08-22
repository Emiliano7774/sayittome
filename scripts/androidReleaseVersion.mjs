import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIN_ANDROID_VERSION_CODE = 1;
export const MAX_ANDROID_VERSION_CODE = 2_100_000_000;
export const VERSION_SOURCE_NAMES = ["apkRelease", "gradle", "appVersion"];

const SOURCE_NAME_PRIORITY = ["gradle", "appVersion", "apkRelease"];

export class AndroidVersionError extends Error {
  constructor(code, details = "") {
    super(details ? `${code}:${details}` : code);
    this.name = "AndroidVersionError";
    this.code = code;
    this.details = details;
  }
}

function defaultRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function releasePaths(root = defaultRoot()) {
  return {
    apkRelease: path.join(root, "apk.release.json"),
    gradle: path.join(root, "android", "app", "build.gradle"),
    appVersion: path.join(root, "public", "app-version.json"),
  };
}

export function validateVersionCode(value, source = "unknown") {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new AndroidVersionError("invalid_version_code", source);
  }
  if (value < MIN_ANDROID_VERSION_CODE || value > MAX_ANDROID_VERSION_CODE) {
    throw new AndroidVersionError("version_code_out_of_range", source);
  }
  return value;
}

export function validateVersionName(value, source = "unknown") {
  const versionName = String(value || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(versionName)) {
    throw new AndroidVersionError("invalid_version_name", source);
  }
  return versionName;
}

export function parseGradleDefaultConfig(text, source = "gradle") {
  const codeMatch = String(text || "").match(/^\s*versionCode\s+(\d+)\s*$/m);
  const nameMatch = String(text || "").match(/^\s*versionName\s+"([^"]+)"\s*$/m);
  if (!codeMatch || !nameMatch) {
    throw new AndroidVersionError("invalid_gradle_version", source);
  }
  return {
    versionCode: validateVersionCode(Number(codeMatch[1]), source),
    versionName: validateVersionName(nameMatch[1], source),
  };
}

export function parseJsonReleaseVersion(data, source) {
  if (!data || typeof data !== "object") {
    throw new AndroidVersionError("invalid_version_json", source);
  }
  return {
    versionCode: validateVersionCode(data.versionCode, source),
    versionName: validateVersionName(data.versionName, source),
  };
}

export function computeNextReleaseVersion(sources, options = {}) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new AndroidVersionError("missing_version_sources");
  }

  const parsed = sources.map((source) => ({
    name: String(source?.name || "unknown"),
    versionCode: validateVersionCode(source?.versionCode, source?.name || "unknown"),
    versionName: validateVersionName(source?.versionName, source?.name || "unknown"),
  }));

  const maxCode = Math.max(...parsed.map((source) => source.versionCode));
  const versionCode = maxCode + 1;
  if (versionCode > MAX_ANDROID_VERSION_CODE) {
    throw new AndroidVersionError("version_code_out_of_range", "next");
  }

  const versionName =
    options.versionName !== undefined
      ? validateVersionName(options.versionName, "next")
      : pickVersionName(parsed);

  return { versionCode, versionName, maxCode };
}

export function pickVersionName(sources) {
  const maxCode = Math.max(...sources.map((source) => source.versionCode));
  const ranked = SOURCE_NAME_PRIORITY.map((name) =>
    sources.find((source) => source.name === name && source.versionCode === maxCode),
  ).filter(Boolean);
  const chosen = ranked[0] || sources.find((source) => source.versionCode === maxCode);
  return validateVersionName(chosen?.versionName, chosen?.name || "unknown");
}

export function assertNotDowngrade(sources, nextCode) {
  const versionCode = validateVersionCode(nextCode, "next");
  for (const source of sources) {
    const current = validateVersionCode(source.versionCode, source.name || "unknown");
    if (versionCode < current) {
      throw new AndroidVersionError("version_code_downgrade", source.name || "unknown");
    }
  }
  return versionCode;
}

function readJsonFile(filePath, source) {
  if (!fs.existsSync(filePath)) {
    throw new AndroidVersionError("missing_version_source", source);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new AndroidVersionError("invalid_version_json", source);
  }
}

export function readReleaseSources(root = defaultRoot()) {
  const paths = releasePaths(root);
  const apkRelease = parseJsonReleaseVersion(readJsonFile(paths.apkRelease, "apkRelease"), "apkRelease");
  const gradle = parseGradleDefaultConfig(fs.readFileSync(paths.gradle, "utf8"), "gradle");
  const appVersion = parseJsonReleaseVersion(readJsonFile(paths.appVersion, "appVersion"), "appVersion");
  return {
    paths,
    sources: [
      { name: "apkRelease", ...apkRelease },
      { name: "gradle", ...gradle },
      { name: "appVersion", ...appVersion },
    ],
    apkRelease,
    gradle,
    appVersion,
  };
}

function writeGradleVersion(filePath, version) {
  const currentRaw = fs.readFileSync(filePath, "utf8");
  const current = parseGradleDefaultConfig(currentRaw, "gradle");
  assertNotDowngrade([{ name: "gradle", versionCode: current.versionCode, versionName: current.versionName }], version.versionCode);
  const next = currentRaw
    .replace(/versionCode\s+\d+/, `versionCode ${version.versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version.versionName}"`);
  const written = parseGradleDefaultConfig(next, "gradle");
  if (written.versionCode !== version.versionCode || written.versionName !== version.versionName) {
    throw new AndroidVersionError("gradle_write_mismatch");
  }
  fs.writeFileSync(filePath, next, "utf8");
}

function writeApkRelease(filePath, version) {
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ versionName: version.versionName, versionCode: version.versionCode }, null, 2)}\n`,
    "utf8",
  );
}

function writeAppVersion(filePath, version, extra = {}) {
  let current = {};
  if (fs.existsSync(filePath)) {
    try {
      current = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      current = {};
    }
  }
  const payload = {
    ...current,
    ...extra,
    versionCode: version.versionCode,
    versionName: version.versionName,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function applyReleaseVersion(version, { root = defaultRoot() } = {}) {
  const next = {
    versionCode: validateVersionCode(version.versionCode, "next"),
    versionName: validateVersionName(version.versionName, "next"),
  };
  const { paths, sources } = readReleaseSources(root);
  assertNotDowngrade(sources, next.versionCode);
  writeApkRelease(paths.apkRelease, next);
  writeGradleVersion(paths.gradle, next);
  const appVersion = writeAppVersion(paths.appVersion, next);
  return { ...next, appVersion };
}

export function bumpReleaseVersion({ root = defaultRoot(), versionName } = {}) {
  const { sources } = readReleaseSources(root);
  const next = computeNextReleaseVersion(sources, { versionName });
  return applyReleaseVersion(next, { root });
}

export function readPinnedReleaseVersion(root = defaultRoot()) {
  const { apkRelease, sources } = readReleaseSources(root);
  const maxCode = Math.max(...sources.map((source) => source.versionCode));
  if (apkRelease.versionCode !== maxCode) {
    throw new AndroidVersionError("pinned_version_behind", String(maxCode));
  }
  return apkRelease;
}

export function syncAndroidGradleFromRelease({ root = defaultRoot() } = {}) {
  const pinned = readPinnedReleaseVersion(root);
  const { paths, gradle } = readReleaseSources(root);
  assertNotDowngrade(
    [{ name: "gradle", versionCode: gradle.versionCode, versionName: gradle.versionName }],
    pinned.versionCode,
  );
  writeGradleVersion(paths.gradle, pinned);
  return pinned;
}

export function writeAppVersionMetadata(extra = {}, { root = defaultRoot() } = {}) {
  const pinned = readPinnedReleaseVersion(root);
  const paths = releasePaths(root);
  return writeAppVersion(paths.appVersion, pinned, extra);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const setIdx = process.argv.indexOf("--set");
  const nameIdx = process.argv.indexOf("--name");
  if (setIdx >= 0) {
    const versionCode = Number(process.argv[setIdx + 1]);
    const versionName = nameIdx >= 0 ? process.argv[nameIdx + 1] : undefined;
    const next = applyReleaseVersion(
      {
        versionCode,
        versionName: versionName || readReleaseSources().apkRelease.versionName,
      },
    );
    console.log("Versión Android fijada:", next);
  } else {
    const next = bumpReleaseVersion();
    console.log("Versión Android incrementada:", next);
  }
}
