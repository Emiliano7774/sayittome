/** Pure validation of a Firebase Messaging web foreground data push.
 * The backend targets a concrete authenticated recipient. Never display
 * cross-account/stale-session or locally authored messages. */
export type WebForegroundChatPushData = Record<string, string | undefined>;

export function shouldShowWebForegroundChatPush(input: {
  data: WebForegroundChatPushData | null | undefined;
  viewerUid: string;
  ownMessage: boolean;
  enabled: boolean;
  /** This tab's anonymous-chat alias, when it has one. */
  anonAlias?: string;
}) {
  const data = input.data;
  if (!input.enabled || !data || data.type !== "chat_message") return false;
  if (!input.viewerUid || !data.recipientUid || data.recipientUid !== input.viewerUid) return false;
  if (!data.chatId || !data.messageId || input.ownMessage) return false;
  if (data.senderAuthUid && data.senderAuthUid === input.viewerUid) return false;
  // The same auth uid can hold several anonymous sessions (one per tab); a
  // push addressed to another alias belongs to a different session.
  if (data.inboxKind === "anon_direct" && data.recipientAnonId && input.anonAlias &&
      data.recipientAnonId !== input.anonAlias) return false;
  return true;
}
