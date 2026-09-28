import { parseProfileAnonChatId } from "@/lib/chat/anonChatId";
import { persistAnonChatMessage } from "@/lib/chat/persistAnonMessage";
import { trackPendingChatSend } from "@/lib/chat/pendingChatSends";
import { profileAuthUid } from "@/lib/chat/profileAnonMessageAuthor";
import {
  buildOutgoingInboxChatRow,
  publishOutgoingInboxChat,
} from "@/lib/chat/publishOutgoingInboxChat";
import { resolveProfileChat } from "@/lib/chat/resolveProfileChat";
import { auth } from "@/lib/firebase";
import {
  buildStoryReplyPayload,
  classifyStoryReplyFailure,
  StoryReplySendError,
  storyReplyLastMessagePreview,
} from "@/lib/stories/storyReplySnapshot";
import type { StoryItem } from "@/lib/stories/types";

export type { StoryReplySnapshot as StoryReplyPayload } from "@/lib/stories/storyReplySnapshot";

/** Prefer the post-bind/persist canonical id over the pre-send resolve id. */
export function resolveStoryReplyNavigationChatId(
  resolvedChatId: string,
  persistedCanonicalChatId?: string,
) {
  return String(persistedCanonicalChatId || resolvedChatId || "").trim();
}

export async function sendStoryReplyMessage(
  story: StoryItem,
  ownerUsername: string,
  messageText: string,
) {
  const username = String(ownerUsername || story.ownerUsername || "").trim();
  const text = String(messageText || "").trim();
  if (!username || !text) {
    throw new StoryReplySendError("lookup", "missing_target");
  }

  let resolved;
  try {
    resolved = await resolveProfileChat(username);
  } catch (error) {
    const classified = classifyStoryReplyFailure(error);
    throw new StoryReplySendError(classified.stage, classified.code, error);
  }
  if (!resolved.targetUid) {
    throw new StoryReplySendError("lookup", "missing_target");
  }

  const storyReply = buildStoryReplyPayload(story, resolved.username || username);
  const lastMessagePreview = storyReplyLastMessagePreview(
    text,
    storyReply.ownerUsername || resolved.username || username,
  );

  let persisted: { messageId: string; canonicalChatId: string };
  try {
    persisted = await trackPendingChatSend(
      persistAnonChatMessage({
        chatId: resolved.chatId,
        username: resolved.username,
        senderId: resolved.senderId,
        currentUid: profileAuthUid(auth.currentUser),
        targetUid: resolved.targetUid,
        targetPhoto: resolved.targetPhoto,
        messageText: text,
        storyReply,
        isOwnerReply: false,
      }),
      { chatId: resolved.chatId },
    );
  } catch (error) {
    const classified = classifyStoryReplyFailure(error);
    throw new StoryReplySendError(classified.stage, classified.code, error);
  }

  const chatId = resolveStoryReplyNavigationChatId(
    resolved.chatId,
    persisted.canonicalChatId,
  );
  if (!chatId) {
    throw new StoryReplySendError("write", "missing_chat_id");
  }

  const boundSender =
    parseProfileAnonChatId(chatId).senderId.startsWith("anon_")
      ? parseProfileAnonChatId(chatId).senderId
      : resolved.senderId;

  const inboxRow = buildOutgoingInboxChatRow({
    chatId,
    username: resolved.username || username,
    targetUid: resolved.targetUid,
    senderId: boundSender,
    lastMessage: lastMessagePreview,
    targetPhoto: resolved.targetPhoto,
    latestMessageId: persisted.messageId,
  });
  if (inboxRow) publishOutgoingInboxChat(inboxRow);

  return chatId;
}
