import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { hasInboxPreview } from "@/lib/chat/inboxVisible";

type OwnerChatRow = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  updatedAt?: { toMillis?: () => number };
  lastMessage?: string;
};

function matchesUsername(chat: OwnerChatRow, username: string) {
  const slug = username.trim().toLowerCase();
  const target = String(chat.targetUsername || chat.receptorUsername || "")
    .trim()
    .toLowerCase();
  return target === slug;
}

function sortByRecent(a: OwnerChatRow, b: OwnerChatRow) {
  const av = a.updatedAt?.toMillis?.() ?? 0;
  const bv = b.updatedAt?.toMillis?.() ?? 0;
  return bv - av;
}

export async function findOwnerIncomingChat(ownerUid: string, username: string) {
  if (!ownerUid || !username) return null;

  const queries = [
    query(collection(db, "chats"), where("receptorUid", "==", ownerUid)),
    query(collection(db, "chats"), where("targetUid", "==", ownerUid)),
  ];

  const rows = new Map<string, OwnerChatRow>();

  for (const q of queries) {
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      rows.set(docSnap.id, {
        id: docSnap.id,
        ...(docSnap.data() as Omit<OwnerChatRow, "id">),
      });
    });
  }

  const matches = [...rows.values()]
    .filter((chat) => matchesUsername(chat, username) && hasInboxPreview(chat))
    .sort(sortByRecent);

  return matches[0] || null;
}
