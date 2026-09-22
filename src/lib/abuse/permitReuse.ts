/**
 * A retried issue-send-permit for the same visitor, chat and message id is the
 * same one-shot permit. A lost CORS response must not turn that into a hard
 * failure, and it must not mint a second permit or a second message.
 */
export function decideExistingPermitReuse(
  existing: Record<string, unknown> | null | undefined,
  expected: { visitorAuthUid: string; chatId: string; messageId: string },
  nowMs: number,
): "accept" | "reject" {
  if (!existing) return "reject";
  const expiresAtMs = Number(existing.expiresAtMs || 0);
  const sameVisitor =
    String(existing.visitorAuthUid || "").trim() === String(expected.visitorAuthUid || "").trim();
  const sameChat = String(existing.chatId || "").trim() === String(expected.chatId || "").trim();
  const sameMessage =
    String(existing.messageId || "").trim() === String(expected.messageId || "").trim();
  if (!sameVisitor || !sameChat || !sameMessage) return "reject";
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return "reject";
  return "accept";
}
