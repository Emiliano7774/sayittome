"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { doc, getDoc } from "firebase/firestore";

import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { auth, db } from "@/lib/firebase";
import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { sanitizeShuffleVisitorChatId } from "@/lib/shuffle/shuffleVisitorId";

export const ANON_PROFILE_GATE_EVENT = "sayittome:anon-profile-blocked";

export type AnonProfileGateDetail = {
  allowChat: boolean;
  username: string;
};

const usernameCache = { uid: "", username: "" };

export function viewerIsAnonymous() {
  const user = auth.currentUser;
  return !user || user.isAnonymous === true;
}

export function requestAnonProfileGate(detail: AnonProfileGateDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANON_PROFILE_GATE_EVENT, { detail }));
}

export function openProfileAnonChat(router: AppRouterInstance, username: string) {
  const clean = String(username || "").trim();
  if (!clean) return;
  const senderId = getChatAnonSenderId();
  const chatId = buildProfileAnonChatId(senderId, clean);
  prefetchChatThread(chatId);
  fastRouterPush(
    router,
    `/chat/${encodeURIComponent(chatId)}?u=${encodeURIComponent(clean)}`,
  );
}

async function readOwnUsername(uid: string) {
  if (usernameCache.uid === uid && usernameCache.username) return usernameCache.username;
  const snap = await getDoc(doc(db, "usuarios", uid));
  const username = String(snap.data()?.username || "").trim();
  if (username) {
    usernameCache.uid = uid;
    usernameCache.username = username;
  }
  return username;
}

/** Select a live Shuffle visitor. Registered users use profile-anon chat;
 * anonymous visitors use consent-bound direct matching, never a registration gate. */
export async function openVisitorChat(
  router: AppRouterInstance,
  visitorChatId: string,
  visitorMatchAnonId?: string,
) {
  const visitorId = sanitizeShuffleVisitorChatId(visitorChatId);
  const matchAlias = sanitizeShuffleVisitorChatId(visitorMatchAnonId);
  if (!visitorId) return false;
  const user = auth.currentUser || await ensureStorageAuth({ allowAnonymous: true }).catch(() => null);
  if (!user) return false;
  if (user.isAnonymous) {
    // Profile-anon local session IDs are NOT bound match aliases. Only a
    // verified server alias may be used for targeted anon-to-anon routing.
    if (!matchAlias) {
      window.alert("La sesión anónima ya no está disponible. Actualizá Shuffle.");
      return false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sayittome:anon-direct-target-request", {
        detail: { targetAnonId: matchAlias },
      }));
    }
    return true;
  }

  const username = await readOwnUsername(user.uid);
  if (!username) {
    requestAnonProfileGate({ allowChat: false, username: "" });
    return false;
  }

  const chatId = buildProfileAnonChatId(visitorId, username);
  prefetchChatThread(chatId);
  fastRouterPush(
    router,
    `/chat/${encodeURIComponent(chatId)}?u=${encodeURIComponent(username)}&anonPeer=1`,
  );
  return true;
}
