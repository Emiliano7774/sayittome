import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { getAnonSessionId } from "@/lib/chat/anonSession";

export function getLikerId() {
  return auth.currentUser?.uid || getAnonSessionId();
}

export function buildProfileLikeId(likerId: string, targetUid: string) {
  return `${likerId}_${targetUid}`;
}

export async function hasProfileLike(likerId: string, targetUid: string) {
  const snap = await getDoc(doc(db, "perfil_likes", buildProfileLikeId(likerId, targetUid)));
  return snap.exists();
}

/** One like per liker identity (uid or anon session) per target profile — accumulates on profile. */
export async function toggleProfileLike(targetUid: string): Promise<boolean> {
  const likerId = getLikerId();
  if (!likerId || !targetUid || likerId === targetUid) {
    return false;
  }

  const likeId = buildProfileLikeId(likerId, targetUid);
  const likeRef = doc(db, "perfil_likes", likeId);
  const existing = await getDoc(likeRef);
  const nextLiked = !existing.exists();

  const batch = writeBatch(db);

  const targetLikeRef = doc(db, "usuarios", targetUid, "likes_recibidos", likerId);
  const targetUserRef = doc(db, "usuarios", targetUid);

  if (auth.currentUser?.uid) {
    const myUid = auth.currentUser.uid;
    const myLikeRef = doc(db, "usuarios", myUid, "likes_dados", targetUid);

    if (nextLiked) {
      const payload = {
        id: likeId,
        fromUid: myUid,
        fromLikerId: likerId,
        targetUid,
        source: "story",
        createdAt: serverTimestamp(),
      };

      batch.set(likeRef, payload, { merge: true });
      batch.set(targetLikeRef, payload, { merge: true });
      batch.set(myLikeRef, { id: likeId, targetUid, createdAt: serverTimestamp() }, { merge: true });
    } else {
      batch.delete(likeRef);
      batch.delete(targetLikeRef);
      batch.delete(myLikeRef);
    }
  } else if (nextLiked) {
    const payload = {
      id: likeId,
      fromLikerId: likerId,
      fromAnon: true,
      targetUid,
      source: "story",
      createdAt: serverTimestamp(),
    };

    batch.set(likeRef, payload, { merge: true });
    batch.set(targetLikeRef, payload, { merge: true });
  } else {
    batch.delete(likeRef);
    batch.delete(targetLikeRef);
  }

  batch.set(
    targetUserRef,
    {
      likesPerfilCount: increment(nextLiked ? 1 : -1),
      likesCount: increment(nextLiked ? 1 : -1),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  return nextLiked;
}
