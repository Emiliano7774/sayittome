import type { MessageKey } from "@/lib/i18n/getMessage";

export type ProfileMediaSource = "camera" | "gallery";

export function profileMediaSourceLabel(
  source: ProfileMediaSource | undefined,
  mediaType: "image" | "video",
  t: (key: MessageKey) => string,
) {
  if (!source) return null;

  if (source === "camera") {
    return mediaType === "video"
      ? t("story_media_camera_video")
      : t("story_media_camera_photo");
  }

  return mediaType === "video"
    ? t("story_media_gallery_video")
    : t("story_media_gallery_photo");
}

export function normalizeProfileMediaSources(
  raw: unknown,
): Record<string, ProfileMediaSource> {
  if (!raw || typeof raw !== "object") return {};

  const out: Record<string, ProfileMediaSource> = {};
  for (const [url, source] of Object.entries(raw as Record<string, unknown>)) {
    if (!url) continue;
    if (source === "camera" || source === "gallery") {
      out[url] = source;
    }
  }
  return out;
}

function normalizeMediaUrlKey(url: string) {
  return String(url || "").trim().split("?")[0]?.split("#")[0] || "";
}

/** Resolve camera/gallery source even when URL query strings differ. */
export function resolveProfileMediaSourceForUrl(
  sources: Record<string, ProfileMediaSource> | undefined,
  url: string,
): ProfileMediaSource | undefined {
  if (!sources || !url) return undefined;
  if (sources[url]) return sources[url];

  const wanted = normalizeMediaUrlKey(url);
  if (!wanted) return undefined;

  for (const [storedUrl, source] of Object.entries(sources)) {
    if (normalizeMediaUrlKey(storedUrl) === wanted) {
      return source;
    }
  }

  return undefined;
}
