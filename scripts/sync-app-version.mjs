import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyReleaseVersion,
  bumpReleaseVersion,
  readPinnedReleaseVersion,
  writeAppVersionMetadata,
} from "./androidReleaseVersion.mjs";

export { bumpReleaseVersion, readPinnedReleaseVersion as readReleaseConfig };

export function writeReleaseConfig({ versionName, versionCode }) {
  return applyReleaseVersion({ versionName, versionCode });
}

export function syncAppVersion({
  releasedAt = new Date().toISOString(),
  bump = false,
  apkUpdatedAt = releasedAt,
  apkSizeBytes = null,
} = {}) {
  if (bump) {
    bumpReleaseVersion();
  }

  return writeAppVersionMetadata({
    releasedAt,
    apkUpdatedAt,
    ...(apkSizeBytes ? { apkSizeBytes } : {}),
    apkUrl: "/api/download/apk",
  });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const payload = syncAppVersion();
  console.log("app-version.json actualizado:", payload);
}
