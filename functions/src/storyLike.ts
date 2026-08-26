/**
 * Idempotent story like/unlike + profile "me gusta" adjustment.
 * Admin SDK transaction — never trust client increments.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { db, ensureAdminApp } from "./adminApp";

export type ToggleStoryLikeInput = {
  storyId?: string;
};

export type ToggleStoryLikeResult = {
  ok: true;
  liked: boolean;
  likeCount: number;
  profileDelta: number;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

export async function handleToggleStoryLike(
  request: CallableRequest<ToggleStoryLikeInput>,
): Promise<ToggleStoryLikeResult> {
  ensureAdminApp();
  const authUid = asId(request.auth?.uid);
  if (!authUid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const storyId = asId(request.data?.storyId);
  if (!storyId || storyId.includes("/") || storyId.includes("\\")) {
    throw new HttpsError("invalid-argument", "Invalid storyId");
  }

  const firestore = db();
  const storyRef = firestore.collection("historias").doc(storyId);

  const result = await firestore.runTransaction(async (tx) => {
    const storySnap = await tx.get(storyRef);
    if (!storySnap.exists) {
      throw new HttpsError("not-found", "Story not found");
    }
    const story = storySnap.data() || {};
    const ownerUid = asId(story.ownerUid || story.uid);
    if (!ownerUid) {
      throw new HttpsError("failed-precondition", "Story has no owner");
    }
    if (ownerUid === authUid) {
      throw new HttpsError("invalid-argument", "Cannot like own story");
    }

    const likedBy =
      story.likedBy && typeof story.likedBy === "object"
        ? ({ ...(story.likedBy as Record<string, unknown>) } as Record<string, boolean>)
        : ({} as Record<string, boolean>);
    const wasLiked = likedBy[authUid] === true;
    const nextLiked = !wasLiked;
    const prevCount = Math.max(0, Number(story.likeCount || 0) || 0);
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    likedBy[authUid] = nextLiked;

    const storyPatch: Record<string, unknown> = {
      likeCount: nextCount,
      likedBy,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (nextLiked) {
      storyPatch.storyLikeAt = FieldValue.serverTimestamp();
    }
    tx.set(storyRef, storyPatch, { merge: true });

    // Each story like contributes ±1 to the owner's profile "me gusta".
    // Idempotency is per (storyId, likerUid) via likedBy — no double/negative.
    const profileDelta = nextLiked ? 1 : wasLiked ? -1 : 0;
    if (profileDelta !== 0) {
      const userRef = firestore.collection("usuarios").doc(ownerUid);
      tx.set(
        userRef,
        {
          likesPerfilCount: FieldValue.increment(profileDelta),
          likesCount: FieldValue.increment(profileDelta),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      const likeId = `${authUid}_${ownerUid}_story_${storyId}`;
      const likeRef = firestore.collection("perfil_likes").doc(likeId);
      const receivedRef = userRef.collection("likes_recibidos").doc(`${authUid}_story_${storyId}`);
      if (nextLiked) {
        const payload = {
          id: likeId,
          fromUid: authUid,
          fromLikerId: authUid,
          targetUid: ownerUid,
          source: "story",
          storyId,
          createdAt: FieldValue.serverTimestamp(),
        };
        tx.set(likeRef, payload, { merge: true });
        tx.set(receivedRef, payload, { merge: true });
      } else {
        tx.delete(likeRef);
        tx.delete(receivedRef);
      }
    }

    return {
      ok: true as const,
      liked: nextLiked,
      likeCount: nextCount,
      profileDelta,
    };
  });

  return result;
}
