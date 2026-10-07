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

export async function toggleStoryLike(
  storyId: string,
  desiredLiked?: boolean,
): Promise<ToggleStoryLikeResult> {
  const id = String(storyId || "").trim();
  if (!id) throw new Error("missing_story_id");

  await ensureStorageAuth({ allowAnonymous: true });
  const callable = httpsCallable<
    { storyId: string; desiredLiked?: boolean },
    ToggleStoryLikeResult
  >(
    functions,
    "toggleStoryLike",
  );
  const result = await callable({
    storyId: id,
    ...(typeof desiredLiked === "boolean" ? { desiredLiked } : {}),
  });
  const data = result.data;
  if (!data?.ok) throw new Error("story_like_failed");
  return data;
}

type PendingStoryLike = {
  desiredLiked: boolean;
  promise: Promise<ToggleStoryLikeResult>;
};

const pendingLikes = new Map<string, PendingStoryLike>();

/**
 * Like that survives the story advancing or the viewer unmounting.
 * The tap captures the id; the callable still runs after the UI is gone.
 */
export function persistStoryLike(
  storyId: string,
  desiredLiked: boolean,
): Promise<ToggleStoryLikeResult> {
  const id = String(storyId || "").trim();
  if (!id) return Promise.reject(new Error("missing_story_id"));
  const existing = pendingLikes.get(id);
  if (existing) {
    existing.desiredLiked = desiredLiked;
    return existing.promise;
  }

  const pending = {} as PendingStoryLike;
  pending.desiredLiked = desiredLiked;
  pending.promise = (async () => {
    let result: ToggleStoryLikeResult | null = null;
    while (true) {
      const target = pending.desiredLiked;
      result = await toggleStoryLike(id, target);
      if (pending.desiredLiked === target) return result;
    }
  })().finally(() => {
    if (pendingLikes.get(id) === pending) pendingLikes.delete(id);
  });
  pendingLikes.set(id, pending);
  return pending.promise;
}
