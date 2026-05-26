import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

import { safeProfileKey } from "./classicFeed";

function profileKey(value: string) {
  return safeProfileKey(value);
}

export function subscribeModerationSeen(
  onChange: (seenByUsername: Record<string, number>) => void,
) {
  return onSnapshot(collection(db, "moderation_seen"), (snap) => {
    const map: Record<string, number> = {};
    for (const row of snap.docs) {
      const data = row.data() as {
        username?: string;
        lastSeenActivityMs?: number;
      };
      const key = profileKey(data.username || row.id);
      map[key] = Number(data.lastSeenActivityMs || 0);
    }
    onChange(map);
  });
}

export async function markModerationUserSeen(
  username: string,
  lastSeenActivityMs: number,
) {
  const key = profileKey(username);
  if (!key) return;

  await setDoc(
    doc(db, "moderation_seen", key),
    {
      username,
      lastSeenActivityMs,
      lastSeenAt: serverTimestamp(),
      seenBy: auth.currentUser?.email || "",
    },
    { merge: true },
  );

  await setDoc(
    doc(db, "moderation_profiles", key),
    {
      username,
      usernameKey: key,
      unseen: false,
      lastSeenAt: serverTimestamp(),
      lastSeenActivityMs,
    },
    { merge: true },
  );
}

export async function markModerationChatSeen(chatId: string) {
  if (!chatId) return;

  await updateDoc(doc(db, "chats", chatId), {
    moderationReviewedAt: serverTimestamp(),
    moderationReviewedBy: auth.currentUser?.email || "",
  }).catch(async () => {
    await setDoc(
      doc(db, "chats", chatId),
      {
        moderationReviewedAt: serverTimestamp(),
        moderationReviewedBy: auth.currentUser?.email || "",
      },
      { merge: true },
    );
  });
}
