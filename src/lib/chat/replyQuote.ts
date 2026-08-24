export type ReplyQuoteSource = {
  text?: string;
  type?: "text" | "audio" | "image" | "video" | string;
  viewOnce?: boolean;
  deletedForEveryone?: boolean;
};

/** Stable quote line stored on the reply message and shown on both sides. */
export function replyQuoteText(message: ReplyQuoteSource | null | undefined): string {
  if (!message || message.deletedForEveryone) return "";
  const text = String(message.text || "").trim();
  if (text) return text.slice(0, 280);

  const type = String(message.type || "text");
  if (type === "image") return message.viewOnce ? "📷 Bomba" : "📷 Foto";
  if (type === "video") return message.viewOnce ? "🎬 Bomba" : "🎬 Video";
  if (type === "audio") return "🎵 Audio";
  return "";
}
