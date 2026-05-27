import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

import { getAnonSessionId } from "@/lib/chat/anonSession";
import { db } from "@/lib/firebase";
import { isValidUsername, normalizeUsername } from "@/lib/profile/username";

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

export function resolveStoryViewerId(user: User | null) {
  if (user && !user.isAnonymous) {
    return user.uid;
  }

  return getAnonSessionId();
}

export function canManageStory(
  story: {
    ownerUid?: string;
    anonSessionId?: string;
    isAnonymousStory?: boolean;
  },
  viewerUid: string,
) {
  const ownerUid = String(story.ownerUid || "");
  if (!ownerUid || !viewerUid) return false;

  if (story.isAnonymousStory || ownerUid.startsWith("anon_")) {
    const anonSessionId = String(story.anonSessionId || ownerUid);
    return viewerUid === anonSessionId;
  }

  return viewerUid === ownerUid;
}
