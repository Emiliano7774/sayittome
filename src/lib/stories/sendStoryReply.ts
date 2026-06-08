import { auth } from "@/lib/firebase";
import { persistAnonChatMessage } from "@/lib/chat/persistAnonMessage";
import {
  fetchProfileByUsername,
  resolveProfileChat,
} from "@/lib/chat/resolveProfileChat";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
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

  const profile = await fetchProfileByUsername(username);
  const targetPhoto = resolveProfilePhoto(profile);
  const currentUid = auth.currentUser?.uid || "";

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
    currentUid,
    targetUid: resolved.targetUid,
    targetPhoto,
    messageText: messageText.trim(),
    storyReply,
  });

  return resolved.chatId;
}
