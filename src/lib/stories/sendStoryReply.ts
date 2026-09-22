import { persistAnonChatMessage } from "@/lib/chat/persistAnonMessage";
import { trackPendingChatSend } from "@/lib/chat/pendingChatSends";
import { profileAuthUid } from "@/lib/chat/profileAnonMessageAuthor";
import { resolveProfileChat } from "@/lib/chat/resolveProfileChat";
import { auth } from "@/lib/firebase";
import { buildStoryReplyPayload } from "@/lib/stories/storyReplySnapshot";
import type { StoryItem } from "@/lib/stories/types";

export type { StoryReplySnapshot as StoryReplyPayload } from "@/lib/stories/storyReplySnapshot";

export async function sendStoryReplyMessage(
  story: StoryItem,
  ownerUsername: string,
  messageText: string,
) {
  const username = String(ownerUsername || story.ownerUsername || "").trim();
  if (!username || !messageText.trim()) {
    throw new Error("missing_story_reply_target");
  }

  const resolved = await resolveProfileChat(username);
  if (!resolved.targetUid) {
    throw new Error("missing_story_reply_target");
  }

  const storyReply = buildStoryReplyPayload(story, username);

  await trackPendingChatSend(
    persistAnonChatMessage({
      chatId: resolved.chatId,
      username: resolved.username,
      senderId: resolved.senderId,
      currentUid: profileAuthUid(auth.currentUser),
      targetUid: resolved.targetUid,
      targetPhoto: resolved.targetPhoto,
      messageText: messageText.trim(),
      storyReply,
      isOwnerReply: false,
    }),
    { chatId: resolved.chatId },
  );

  return resolved.chatId;
}
