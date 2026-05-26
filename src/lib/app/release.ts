export type ApkReleaseInfo = {
  versionCode: number;
  versionName: string;
  releasedAt: string;
  apkUrl: string;
};

export const APK_RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function parseApkRelease(raw: unknown): ApkReleaseInfo | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  const versionCode = Number(data.versionCode);
  const versionName = String(data.versionName || "").trim();
  const releasedAt = String(data.releasedAt || "").trim();
  const apkUrl = String(data.apkUrl || "/downloads/sayittome.apk").trim();

  if (!versionName || !releasedAt || Number.isNaN(versionCode)) {
    return null;
  }

  return {
    versionCode,
    versionName,
    releasedAt,
    apkUrl,
  };
}

export function isApkReleaseFresh(release: ApkReleaseInfo, now = Date.now()) {
  const releasedAtMs = new Date(release.releasedAt).getTime();
  if (Number.isNaN(releasedAtMs)) return false;
  return now - releasedAtMs >= 0 && now - releasedAtMs < APK_RELEASE_WINDOW_MS;
}
