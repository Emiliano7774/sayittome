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
  const releasedAt = String(data.releasedAt || data.apkUpdatedAt || "").trim();
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

export function apkReleaseRemainingMs(release: ApkReleaseInfo, now = Date.now()) {
  const releasedAtMs = new Date(release.releasedAt).getTime();
  if (Number.isNaN(releasedAtMs)) return 0;
  const expiresAtMs = releasedAtMs + APK_RELEASE_WINDOW_MS;
  return Math.max(0, expiresAtMs - now);
}

export function formatApkReleaseRemaining(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}
