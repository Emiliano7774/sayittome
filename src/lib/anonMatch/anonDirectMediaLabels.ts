export type AnonDirectMediaType = "text" | "audio" | "image" | "video";
export type AnonDirectMediaSource = "camera" | "gallery" | "audio";

/** Stable ultimoMensaje / OS-notify preview (Spanish product strings, match ProfileAnonChat tone). */
export function anonDirectMediaLastMessageLabel(
  type: AnonDirectMediaType,
  source?: AnonDirectMediaSource,
): string {
  if (type === "text") return "";
  if (type === "audio") return "audio";
  if (type === "video") {
    return source === "camera" ? "video desde cámara" : "video";
  }
  return source === "camera" ? "enviado desde cámara" : "foto";
}

export function anonDirectIncomingNotifyBody(input: {
  text?: string;
  type?: AnonDirectMediaType | string;
  source?: AnonDirectMediaSource | string;
}): string {
  const text = String(input.text || "").trim();
  if (text) return text;
  const type = String(input.type || "text") as AnonDirectMediaType;
  if (type === "text") return "";
  return anonDirectMediaLastMessageLabel(
    type,
    input.source as AnonDirectMediaSource | undefined,
  );
}
