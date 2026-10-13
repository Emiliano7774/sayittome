/** Pure compatibility for old and new chat media; safe to run on client/server. */
export type AdminMessageMediaKind = "text" | "image" | "video" | "audio";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function kindFrom(value: unknown): AdminMessageMediaKind | "" {
  const str = clean(value);
  if (["image", "photo", "foto", "picture"].includes(str) || str.startsWith("image/")) return "image";
  if (["video", "clip"].includes(str) || str.startsWith("video/")) return "video";
  if (["audio", "voice", "voz", "voice_message", "voice-message"].includes(str) || str.startsWith("audio/")) return "audio";
  return "";
}

/** A legacy generic media type uses mediaType to identify its actual file. */
export function resolveAdminMessageKind(data: Record<string, unknown>): AdminMessageMediaKind {
  const explicit = kindFrom(data.mediaType) || kindFrom(data.mimeType) || kindFrom(data.contentType);
  const nominal = kindFrom(data.type) || kindFrom(data.tipo);
  if (explicit) return explicit;
  if (nominal) return nominal;

  if (clean(data.audioUrl) || clean(data.voiceUrl)) return "audio";
  if (clean(data.videoUrl)) return "video";
  if (clean(data.imageUrl) || clean(data.photoUrl)) return "image";

  const url = String(
    data.mediaUrl || data.fileUrl || data.url || data.storagePath || data.mediaStoragePath || "",
  );
  const path = url.split(/[?#]/, 1)[0];
  if (/\.(mp3|m4a|aac|wav|ogg|opus|oga)$/i.test(path)) return "audio";
  if (/\.(mp4|mov|webm|m4v|3gp)$/i.test(path)) return "video";
  if (/\.(jpe?g|png|gif|webp|heic|avif)$/i.test(path)) return "image";
  // No guessed media kind for a URL with no metadata.
  return "text";
}

export function hasAdminMessageAttachment(data: Record<string, unknown>) {
  return resolveAdminMessageKind(data) !== "text" ||
    data.viewOnce === true ||
    data.temporal === true ||
    ["media", "attachment", "archivo"].includes(clean(data.type)) ||
    Boolean(data.mediaUrl || data.imageUrl || data.photoUrl || data.videoUrl || data.audioUrl || data.voiceUrl || data.fileUrl || data.storagePath);
}
