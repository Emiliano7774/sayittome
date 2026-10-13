/**
 * Stable administrative separation of the three historically co-located
 * families in chats_anonimos. Does not change chatId or message storage paths.
 */
export const ANON_REVIEW_BUCKETS = ["direct", "match", "legacy_profile"] as const;
export type AnonReviewBucket = (typeof ANON_REVIEW_BUCKETS)[number];

export function classifyAnonReviewBucket(
  sourceDocId: string,
  data: Record<string, unknown>,
): AnonReviewBucket | "unclassified" {
  const id = String(sourceDocId || "").trim();
  const chatId = String(data.chatId || data.directChatId || data.sessionId || id).trim();
  const source = String(data.source || "").trim();
  const ids = [id, chatId];
  const directId = ids.some((value) => value.startsWith("asd_"));
  const matchId = ids.some((value) => /^(aad|pad|apd|ppd)_/.test(value));

  // The new profile-like anonymous Shuffle DMs use the deterministic asd_
  // identifier; no "No encontraste..." invitation is involved.
  if (source === "shuffle_direct" || directId) {
    if (matchId) return "unclassified"; // Never mix conflicting provenance.
    return "direct";
  }

  // Invited/accepted sessions from "No encontraste a nadie interesante".
  if (matchId) return "match";
  if (
    ["perfil_con_perfil", "perfil_con_anonimo", "anon_con_perfil", "anon_con_anonimo"]
      .includes(String(data.tipo || "")) &&
    (data.solicitanteUid || data.solicitanteAnonId || data.destinatarioUid || data.destinatarioAnonId)
  ) return "match";

  // Older anonymous visitor -> registered profile threads: never random-match.
  if (
    ((data.receptorUid || data.receptorUsername) &&
      (data.visitorId || data.fingerprintAnonimo || data.anonId)) ||
    // A few historical rows lost participant fields, but retain the legacy
    // read/typing schema unique to anonymous-to-profile conversations.
    (Object.hasOwn(data, "ultimoMensajeLeidoPorAnonimo") &&
      (Object.hasOwn(data, "typingAnon") || Object.hasOwn(data, "mensajesCount")))
  ) return "legacy_profile";

  const stored = String(data.adminReviewBucket || "");
  if (ANON_REVIEW_BUCKETS.some((bucket) => bucket === stored)) {
    return stored as AnonReviewBucket;
  }
  return "unclassified";
}
