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
