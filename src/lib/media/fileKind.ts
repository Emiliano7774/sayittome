const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  "bmp",
  "avif",
  "jfif",
]);

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "mkv", "3gp", "m4v"]);

export type MediaFileKind = "image" | "video";

function fileExtension(name: string) {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return parts.pop()?.toLowerCase() || "";
}

export function guessMediaFileKind(file: File): MediaFileKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";

  const ext = fileExtension(file.name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";

  // Android gallery picks often have empty type and no extension.
  if (!file.type && !ext) {
    return "image";
  }

  return null;
}

export function isMediaFile(file: File) {
  return guessMediaFileKind(file) != null;
}

export function resolveUploadContentType(file: File, kind: MediaFileKind): string {
  if (file.type && !file.type.includes("octet-stream")) {
    return file.type;
  }

  const ext = fileExtension(file.name);

  if (kind === "image") {
    if (ext === "jpg" || ext === "jpeg" || ext === "jfif") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "heic" || ext === "heif") return "image/heic";
    return "image/jpeg";
  }

  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "3gp") return "video/3gpp";
  return "video/mp4";
}
