import { auth } from "@/lib/firebase";
import { persistAnonChatMessage } from "@/lib/chat/persistAnonMessage";
import { resolveProfileChat } from "@/lib/chat/resolveProfileChat";
import type { StoryItem } from "@/lib/stories/types";

export type StoryReplyPayload = {
  storyId: string;
  mediaUrl?: string;
  mediaType?: string;
  ownerUsername?: string;
};

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

  const storyReply: StoryReplyPayload = {
    storyId: story.id,
    mediaUrl: story.mediaUrl || undefined,
    mediaType: story.mediaType,
    ownerUsername: username,
  };

  await persistAnonChatMessage({
    chatId: resolved.chatId,
    username: resolved.username,
    senderId: resolved.senderId,
    currentUid: auth.currentUser?.uid || "",
    targetUid: resolved.targetUid,
    targetPhoto: resolved.targetPhoto,
    messageText: messageText.trim(),
    storyReply,
  });

  return resolved.chatId;
}
