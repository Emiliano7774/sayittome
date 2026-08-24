import type { StoryItem } from "@/lib/stories/types";

export type StoryReplySnapshot = {
  storyId: string;
  mediaUrl?: string;
  mediaType?: string;
  ownerUsername?: string;
};

export const STORY_REPLY_PREFIX = "\u001eSTORY_REPLY\u001e";

export function sanitizeStoryReplySnapshot(
  input: Partial<StoryReplySnapshot> | null | undefined,
): StoryReplySnapshot | null {
  const storyId = String(input?.storyId || "").trim();
  if (!storyId) return null;

  const mediaUrl = String(input?.mediaUrl || "").trim();
  const mediaType = String(input?.mediaType || "").trim();
  const ownerUsername = String(input?.ownerUsername || "").trim();

  return {
    storyId,
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(ownerUsername ? { ownerUsername } : {}),
  };
}

export function buildStoryReplyPayload(
  story: Pick<StoryItem, "id" | "mediaUrl" | "mediaType" | "ownerUsername">,
  ownerUsername: string,
): StoryReplySnapshot {
  const username = String(ownerUsername || story.ownerUsername || "").trim();
  const payload = sanitizeStoryReplySnapshot({
    storyId: story.id,
    mediaUrl: story.mediaUrl || undefined,
    mediaType: story.mediaType,
    ownerUsername: username,
  });
  if (!payload) {
    throw new Error("missing_story_reply_target");
  }
  return payload;
}

export function encodeStoryReplySnapshot(
  snapshot: StoryReplySnapshot | null | undefined,
) {
  const sanitized = sanitizeStoryReplySnapshot(snapshot);
  if (!sanitized) return "";
  return `${STORY_REPLY_PREFIX}${JSON.stringify(sanitized)}`;
}

export function decodeStoryReplySnapshot(
  value: unknown,
): StoryReplySnapshot | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return sanitizeStoryReplySnapshot(value as Partial<StoryReplySnapshot>);
  }

  const raw = String(value || "");
  if (!raw.startsWith(STORY_REPLY_PREFIX)) return null;

  try {
    return sanitizeStoryReplySnapshot(
      JSON.parse(raw.slice(STORY_REPLY_PREFIX.length)) as Partial<StoryReplySnapshot>,
    );
  } catch {
    return null;
  }
}

export function resolveStoryReplyCard(input: {
  storyReply?: unknown;
  reply?: unknown;
}): { snapshot: StoryReplySnapshot; quote?: string } | null {
  const fromField = decodeStoryReplySnapshot(input.storyReply);
  const fromReply = decodeStoryReplySnapshot(input.reply);
  const snapshot = fromField || fromReply;
  if (!snapshot) return null;

  const quote = String(input.reply || "");
  return {
    snapshot,
    quote: quote.startsWith(STORY_REPLY_PREFIX) ? undefined : quote || undefined,
  };
}

export function storyReplyLastMessagePreview(text: string, ownerUsername?: string) {
  const body = String(text || "").trim();
  const owner = String(ownerUsername || "").trim();
  if (body && owner) return `${body} · @${owner}`;
  if (body) return body;
  if (owner) return `@${owner}`;
  return "Historia";
}

/** Canonical persist fields for a story reply — nested map + encoded `reply` fallback. */
export function buildStoryReplyPersistPatch(input: {
  messageText: string;
  storyReply?: unknown;
  reply?: string;
}) {
  const storyReply = decodeStoryReplySnapshot(input.storyReply);
  const encodedStoryReply = storyReply ? encodeStoryReplySnapshot(storyReply) : "";
  const storedReply = String(input.reply || encodedStoryReply || "");
  return {
    storyReply,
    encodedStoryReply,
    storedReply,
    lastMessagePreview: storyReply
      ? storyReplyLastMessagePreview(input.messageText, storyReply.ownerUsername)
      : input.messageText,
  };
}

export function omitNestedStoryReplyField<T extends { storyReply?: unknown }>(
  payload: T,
): T {
  if (!("storyReply" in payload)) return payload;
  const next = { ...payload };
  delete next.storyReply;
  return next;
}

/**
 * One chat/message commit. If Firestore rejects the nested `storyReply` map,
 * retry exactly once with the encoded snapshot already stored on `reply`.
 */
export async function commitWithStoryReplyRulesFallback<
  T extends { storyReply?: unknown },
>(
  payload: T,
  commit: (next: T) => Promise<void>,
): Promise<{
  attempts: number;
  committed: T;
  retriedWithoutNestedMap: boolean;
}> {
  try {
    await commit(payload);
    return { attempts: 1, committed: payload, retriedWithoutNestedMap: false };
  } catch (error) {
    if (!payload.storyReply || !isFirestorePermissionDenied(error)) throw error;
    const fallback = omitNestedStoryReplyField(payload);
    await commit(fallback);
    return { attempts: 2, committed: fallback, retriedWithoutNestedMap: true };
  }
}

export function isFirestorePermissionDenied(error: unknown) {
  const code = String(
    (error as { code?: string } | null)?.code || "",
  ).toLowerCase();
  const message = String(
    error instanceof Error
      ? error.message
      : (error as { message?: string } | null)?.message || error || "",
  ).toLowerCase();
  return (
    code.includes("permission-denied") ||
    message.includes("permission-denied") ||
    message.includes("missing or insufficient permissions")
  );
}

export type StoryReplyFailureStage = "lookup" | "identity" | "write";

export class StoryReplySendError extends Error {
  stage: StoryReplyFailureStage;
  code: string;

  constructor(stage: StoryReplyFailureStage, code: string, cause?: unknown) {
    super(`${stage}:${code}`);
    this.name = "StoryReplySendError";
    this.stage = stage;
    this.code = String(code || stage);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function classifyStoryReplyFailure(error: unknown): {
  stage: StoryReplyFailureStage;
  code: string;
} {
  if (error instanceof StoryReplySendError) {
    return { stage: error.stage, code: error.code };
  }

  const name = String((error as { name?: string } | null)?.name || "");
  const code = String((error as { code?: string } | null)?.code || "").trim();
  const message = String(
    error instanceof Error
      ? error.message
      : (error as { message?: string } | null)?.message || error || "",
  ).trim();

  if (name === "PersistIdentityError" || message === "owner_identity_not_ready") {
    return { stage: "identity", code: "owner_identity_not_ready" };
  }
  if (
    message === "missing_story_reply_target" ||
    message === "missing_profile_username" ||
    message === "missing_target"
  ) {
    return { stage: "lookup", code: message };
  }
  return { stage: "write", code: code || "write" };
}

const STORY_REPLY_FAILURE_CODES: Record<string, string> = {
  missing_story_reply_target: "missing_target",
  missing_profile_username: "missing_target",
  missing_target: "missing_target",
  owner_identity_not_ready: "not_ready",
  identity: "not_ready",
  lookup: "lookup",
  write: "write",
  "permission-denied": "permission-denied",
  unauthenticated: "unauthenticated",
  unavailable: "unavailable",
};

const SAFE_FAILURE_CODE_RE = /^[a-z][a-z0-9._/-]{0,31}$/;

export function sanitizeStoryReplyFailureCode(code: string) {
  const raw = String(code || "").trim();
  const lower = raw.toLowerCase();
  if (STORY_REPLY_FAILURE_CODES[lower]) return STORY_REPLY_FAILURE_CODES[lower];
  if (/\s/.test(raw) || raw.length > 40) return "error";
  const compact = lower.replace(/[^a-z0-9._/-]+/g, "");
  if (STORY_REPLY_FAILURE_CODES[compact]) return STORY_REPLY_FAILURE_CODES[compact];
  if (SAFE_FAILURE_CODE_RE.test(compact)) return compact;
  return "error";
}

export function formatStoryReplyFailure(error: unknown) {
  const { stage, code } = classifyStoryReplyFailure(error);
  const safeCode = sanitizeStoryReplyFailureCode(code);
  if (stage === "lookup") {
    return `No se pudo encontrar el chat (${stage}:${safeCode}).`;
  }
  if (stage === "identity") {
    return `No se pudo confirmar tu identidad (${stage}:${safeCode}).`;
  }
  return `No se pudo enviar la respuesta (${stage}:${safeCode}).`;
}

export function applyStoryReplySendAck(ok: boolean) {
  return {
    closeComposer: ok,
    showSentToast: ok,
    keepComposerText: !ok,
  };
}
