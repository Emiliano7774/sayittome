const VIDEO_EXT = new Set(["mp4", "mov", "webm", "mkv", "3gp", "m4v"]);

export function isVideoMediaUrl(url?: string | null) {
  if (!url) return false;

  let path = String(url).split("?")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep raw path when decoding fails.
  }

  const normalized = path.toLowerCase();
  const ext = normalized.split(".").pop() || "";

  if (VIDEO_EXT.has(ext)) return true;
  if (
    normalized.includes("cover_video") ||
    normalized.includes("_video_") ||
    normalized.includes("/videos/")
  ) {
    return true;
  }

  return false;
}
