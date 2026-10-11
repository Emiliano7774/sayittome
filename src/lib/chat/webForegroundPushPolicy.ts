/** Pure validation of a Firebase Messaging web foreground data push.
 * The backend targets a concrete authenticated recipient. Never display
 * cross-account/stale-session or locally authored messages. */
export type WebForegroundChatPushData = Record<string, string | undefined>;

export function shouldShowWebForegroundChatPush(input: {
  data: WebForegroundChatPushData | null | undefined;
  viewerUid: string;
  ownMessage: boolean;
  enabled: boolean;
}) {
  const data = input.data;
  if (!input.enabled || !data || data.type !== "chat_message") return false;
  if (!input.viewerUid || !data.recipientUid || data.recipientUid !== input.viewerUid) return false;
  if (!data.chatId || !data.messageId || input.ownMessage) return false;
  if (data.senderAuthUid && data.senderAuthUid === input.viewerUid) return false;
  return true;
}
