/**
 * Client wrapper for callable toggleStoryLike — no direct historias like writes.
 */
import { httpsCallable } from "firebase/functions";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { functions } from "@/lib/firebase";

export type ToggleStoryLikeResult = {
  ok: boolean;
  liked: boolean;
  likeCount: number;
  profileDelta: number;
};

export async function toggleStoryLike(storyId: string): Promise<ToggleStoryLikeResult> {
  const id = String(storyId || "").trim();
  if (!id) throw new Error("missing_story_id");

  await ensureStorageAuth({ allowAnonymous: true });
  const callable = httpsCallable<{ storyId: string }, ToggleStoryLikeResult>(
    functions,
    "toggleStoryLike",
  );
  const result = await callable({ storyId: id });
  const data = result.data;
  if (!data?.ok) throw new Error("story_like_failed");
  return data;
}

const pendingLikes = new Map<string, Promise<ToggleStoryLikeResult>>();

/**
 * Like that survives the story advancing or the viewer unmounting.
 * The tap captures the id; the callable still runs after the UI is gone.
 */
export function persistStoryLike(storyId: string): Promise<ToggleStoryLikeResult> {
  const id = String(storyId || "").trim();
  if (!id) return Promise.reject(new Error("missing_story_id"));
  const existing = pendingLikes.get(id);
  if (existing) return existing;
  const next = toggleStoryLike(id).finally(() => {
    pendingLikes.delete(id);
  });
  pendingLikes.set(id, next);
  return next;
}
