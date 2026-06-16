export const ADMIN_UNDO_ACTION: Record<string, string> = {
  ban_temp: "unban",
  ban_perm: "unban",
  blur_profile: "unblur_profile",
  blur_stories_flag: "unblur_profile",
  tag_roleplay: "clear_moderation_tag",
  mark_chat_suspicious: "unmark_chat_suspicious",
  blur_story: "unblur_story",
};

export function getUndoActionFor(action?: string | null) {
  if (!action) return null;
  if (action === "shadowban") return "shadowban";
  return ADMIN_UNDO_ACTION[action] || null;
}

export function buildUndoPayload(
  originalAction: string,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const undoAction = getUndoActionFor(originalAction);
  if (!undoAction) return null;

  const payload: Record<string, unknown> = {
    action: undoAction,
    uid: String(metadata.uid || ""),
    undoneAction: originalAction,
  };

  const chatId = String(metadata.chatId || "");
  const storyId = String(metadata.storyId || "");
  const messageId = String(metadata.messageId || "");
  const blockId = String(metadata.blockId || "");

  if (chatId) payload.chatId = chatId;
  if (storyId) payload.storyId = storyId;
  if (messageId) payload.messageId = messageId;
  if (blockId) payload.blockId = blockId;

  if (originalAction === "shadowban") {
    payload.enabled = false;
  }

  return payload;
}

export function canUndoAdminAction(action?: string | null) {
  return Boolean(getUndoActionFor(action));
}
