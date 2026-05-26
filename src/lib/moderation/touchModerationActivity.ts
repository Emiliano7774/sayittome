import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type { ModerationChatRow } from "./types";
import { safeProfileKey } from "./classicFeed";

function safeProfileKeyLocal(value: string) {
  return safeProfileKey(value);
}

async function resolveUsernameFromUid(uid: string) {
  if (!uid) return "";
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    if (!snap.exists()) return "";
    const data = snap.data() as { username?: string; nombre?: string };
    return String(data.username || data.nombre || "").trim();
  } catch {
    return "";
  }
}

/** Actualiza lastModerationActivityAt en moderation_profiles para cada perfil involucrado. */
export async function touchModerationActivityFromChat(chat: ModerationChatRow) {
  if (typeof window === "undefined") return;

  const usernames = new Set<string>();
  const uids = new Set<string>();

  if (chat.targetUsername) usernames.add(chat.targetUsername);
  if (chat.receptorUsername) usernames.add(chat.receptorUsername);

  for (const uid of [chat.receptorUid, chat.targetUid, chat.initiatorUid, chat.anonOwnerUid]) {
    if (uid) uids.add(uid);
  }

  for (const uid of uids) {
    const resolved = await resolveUsernameFromUid(uid);
    if (resolved) usernames.add(resolved);
  }

  const activityMs = Date.now();
  const preview = String(chat.lastMessage || "").trim() || "Nueva actividad";

  await Promise.all(
    [...usernames].map(async (username) => {
      const key = safeProfileKeyLocal(username);
      if (!key) return;

      await setDoc(
        doc(db, "moderation_profiles", key),
        {
          username,
          usernameKey: key,
          lastModerationActivityAt: serverTimestamp(),
          lastModerationActivityMs: activityMs,
          lastMessagePreview: preview,
          lastChatId: chat.id,
          unseen: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }),
  );
}

/** Fire-and-forget wrapper — nunca bloquea el envío de mensajes. */
export function scheduleModerationActivityTouch(chat: ModerationChatRow) {
  void touchModerationActivityFromChat(chat).catch((error) => {
    console.error("touchModerationActivityFromChat", error);
  });
}
