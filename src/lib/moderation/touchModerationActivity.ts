import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import { canonicalOwnerUids, moderationActivityWriteUsernames } from "@/lib/moderation/chatHistory";
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

/** Actualiza lastModerationActivityAt solo para el destinatario/owner canónico corroborado. */
export async function touchModerationActivityFromChat(chat: ModerationChatRow) {
  if (typeof window === "undefined") return;

  const resolvedByUid: Record<string, string> = {};
  for (const uid of canonicalOwnerUids(chat as unknown as Record<string, unknown>)) {
    const resolved = await resolveUsernameFromUid(uid);
    if (resolved) resolvedByUid[uid] = resolved;
  }

  const usernames = moderationActivityWriteUsernames(
    chat as unknown as Record<string, unknown>,
    resolvedByUid,
  );

  const activityMs = Date.now();
  const preview = String(chat.lastMessage || "").trim() || "Nueva actividad";

  await Promise.all(
    usernames.map(async (username) => {
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
export function shouldScheduleModerationActivityTouch(
  chat: ModerationChatRow | Record<string, unknown>,
) {
  return (
    moderationActivityWriteUsernames(chat as Record<string, unknown>).length > 0
  );
}

export function scheduleModerationActivityTouch(chat: ModerationChatRow) {
  if (!shouldScheduleModerationActivityTouch(chat)) return;
  void touchModerationActivityFromChat(chat).catch((error) => {
    console.error("touchModerationActivityFromChat", error);
  });
}
