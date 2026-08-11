import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

import { getAnonSessionId } from "@/lib/chat/anonSession";
import { auth, db } from "@/lib/firebase";
import { isValidUsername, normalizeUsername } from "@/lib/profile/username";
import { resolveStoryOwnerKeyFromState } from "@/lib/stories/storyOwnerIdentity";

export type StoryAuthor = {
  ownerUid: string;
  ownerUsername: string;
  ownerPhoto: string;
  isAnonymousStory: boolean;
  anonSessionId: string;
};

export function isInvalidPublicStoryUsername(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return true;
  if (clean.includes("@")) return true;
  if (!isValidUsername(normalizeUsername(clean))) return true;
  return false;
}

export function usernameFromProfileData(data: Record<string, unknown> | undefined) {
  if (!data) return "";

  const candidates = [
    data.username,
    data.usernameLower,
    data.nombre,
  ];

  for (const candidate of candidates) {
    const clean = normalizeUsername(String(candidate || ""));
    if (clean && isValidUsername(clean)) return clean;
  }

  return "";
}

export async function fetchProfileStoryIdentity(uid: string) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) {
    return { username: "", photo: "" };
  }

  const data = snap.data() as Record<string, unknown>;
  return {
    username: usernameFromProfileData(data),
    photo: String(data.fotoPrincipal || data.photoURL || ""),
  };
}

export async function resolveStoryAuthor(user: User | null): Promise<StoryAuthor> {
  if (user && !user.isAnonymous) {
    const profile = await fetchProfileStoryIdentity(user.uid);
    const ownerUsername = profile.username;

    if (!ownerUsername) {
      throw new Error("profile_username_missing");
    }

    return {
      ownerUid: user.uid,
      ownerUsername,
      ownerPhoto: profile.photo,
      isAnonymousStory: false,
      anonSessionId: "",
    };
  }

  const anonSessionId = getAnonSessionId();

  return {
    ownerUid: anonSessionId,
    ownerUsername: "",
    ownerPhoto: "",
    isAnonymousStory: true,
    anonSessionId,
  };
}

const STORY_ANON_VIEWER_KEY = "sayittome_story_viewer_anon_v1";

let storyViewerAuthReady = false;

export function markStoryViewerAuthReady() {
  storyViewerAuthReady = true;
}

export function isStoryViewerPending() {
  return !storyViewerAuthReady && !(auth.currentUser && !auth.currentUser.isAnonymous);
}

export function peekDurableStoryAnonViewerId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(STORY_ANON_VIEWER_KEY);
    return existing && existing.startsWith("anon_") ? existing : "";
  } catch {
    return "";
  }
}

export function syncDurableStoryAnonViewerId(nextId: string) {
  const next = String(nextId || "").trim();
  if (!next.startsWith("anon_")) return;
  try {
    localStorage.setItem(STORY_ANON_VIEWER_KEY, next);
  } catch {
    // ignore
  }
}

/** Same anon id for create, view, manage. Migrates from chat session once. */
export function getDurableStoryAnonViewerId() {
  if (typeof window === "undefined") return "";

  const existing = peekDurableStoryAnonViewerId();
  if (existing) return existing;

  let session = "";
  try {
    session = sessionStorage.getItem("sayittome_anon_session") || "";
  } catch {
    session = "";
  }
  const next = session.startsWith("anon_") ? session : getAnonSessionId();
  syncDurableStoryAnonViewerId(next);
  return next;
}

export function resolveStoryViewerId(user: User | null) {
  if (user && !user.isAnonymous) {
    return user.uid;
  }
  if (!user && !storyViewerAuthReady) {
    return "";
  }
  return getDurableStoryAnonViewerId();
}

/** Await Firebase auth + Stories readiness, then resolve the viewer id. */
export async function resolveStoryViewerIdReady(user?: User | null) {
  await auth.authStateReady();
  markStoryViewerAuthReady();
  return resolveStoryViewerId(user === undefined ? auth.currentUser : user);
}

/** Same identity used to mark and read story views (not getLikerId). */
export function getStoryViewerKey() {
  if (typeof window === "undefined") return "";
  return resolveStoryViewerId(auth.currentUser);
}

/** Session id for create / manage / cleanup. Never the durable seen-id. */
export function getStoryOwnerKey() {
  if (typeof window === "undefined") return "";
  const user = auth.currentUser;
  return resolveStoryOwnerKeyFromState({
    uid: user?.uid || "",
    isAnonymous: !user || user.isAnonymous,
    authReady: storyViewerAuthReady,
    sessionId: getAnonSessionId(),
  });
}

export {
  canManageStory,
  isMineStoryGroup,
  resolveStoryOwnerKeyFromState,
  splitMineStoryGroups,
} from "@/lib/stories/storyOwnerIdentity";
