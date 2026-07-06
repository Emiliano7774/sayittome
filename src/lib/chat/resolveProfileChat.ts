import { auth } from "@/lib/firebase";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  buildLegacyProfileChatIds,
  buildProfileAnonChatId,
  parseProfileAnonChatId,
} from "@/lib/chat/anonChatId";
import { findOwnerIncomingChat } from "@/lib/chat/findOwnerIncomingChat";
import { maybeMigrateExistingProfileChat } from "@/lib/chat/migrate";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import {
  getCachedFullProfile,
  setCachedFullProfile,
} from "@/lib/profile/profileCache";
import { ProfileUsernameChangedError } from "@/lib/profile/usernameHistory";
import { withTimeout } from "@/lib/async/withTimeout";
import { isNavTraceEnabled } from "@/lib/perf/navTrace";
import { profilePipelineMark } from "@/lib/perf/profilePipelineTrace";

export class OwnerProfileInboxRedirect extends Error {
  readonly code = "owner_profile_inbox_redirect";

  constructor() {
    super("owner_profile_inbox_redirect");
    this.name = "OwnerProfileInboxRedirect";
  }
}

export function isOwnerProfileInboxRedirect(error: unknown) {
  return (
    error instanceof OwnerProfileInboxRedirect ||
    (error instanceof Error && error.message === "owner_profile_inbox_redirect")
  );
}

export type ProfileLookupResult = {
  profile: Record<string, unknown> | null;
  usernameChanged: boolean;
  requestedUsername: string;
  currentUsername: string;
};

export async function lookupProfileByUsername(
  username: string,
  force = false,
): Promise<ProfileLookupResult> {
  const key = username.trim().toLowerCase();
  if (!force) {
    const cached = getCachedFullProfile(key);
    if (cached) {
      if (isNavTraceEnabled()) {
        profilePipelineMark("cache-hit");
        profilePipelineMark("profile-normalized", { found: true, method: "memory-cache" });
      }
      return {
        profile: cached as Record<string, unknown>,
        usernameChanged: false,
        requestedUsername: username,
        currentUsername: String((cached as { username?: string }).username || username),
      };
    }
  }

  if (isNavTraceEnabled()) {
    profilePipelineMark("lookup-started", { method: "fetch /api/profile" });
    profilePipelineMark("fetch-emitted");
  }

  const res = await withTimeout(
    fetch(`/api/profile/${encodeURIComponent(username)}?ts=${Date.now()}`, {
      cache: "no-store",
    }),
    12000,
    "profile_lookup_timeout",
  );

  if (isNavTraceEnabled()) {
    profilePipelineMark("fetch-response", {
      status: res.status,
      method: "fetch /api/profile",
    });
  }
  const json = await res.json();

  if (json?.reason === "username_changed") {
    return {
      profile: null,
      usernameChanged: true,
      requestedUsername: String(json.requestedUsername || username),
      currentUsername: String(json.currentUsername || ""),
    };
  }

  const profile = json?.profile || null;
  if (profile) {
    setCachedFullProfile(key, profile);
    if (isNavTraceEnabled()) {
      profilePipelineMark("profile-normalized", {
        found: true,
        method: "fetch /api/profile",
      });
    }
  } else if (isNavTraceEnabled()) {
    profilePipelineMark("profile-not-found", { found: false, status: res.status });
  }

  return {
    profile,
    usernameChanged: false,
    requestedUsername: username,
    currentUsername: String(profile?.username || username),
  };
}

export async function fetchProfileByUsername(username: string, force = false) {
  const result = await lookupProfileByUsername(username, force);
  if (result.usernameChanged) {
    throw new ProfileUsernameChangedError(
      result.requestedUsername,
      result.currentUsername,
    );
  }
  return result.profile;
}

export type ResolvedProfileChat = {
  chatId: string;
  senderId: string;
  username: string;
  targetUid: string;
  targetPhoto: string;
  isLoggedIn: boolean;
};

const profileChatCache = new Map<string, Promise<ResolvedProfileChat>>();

export async function resolveProfileChat(username: string): Promise<ResolvedProfileChat> {
  const key = username.trim().toLowerCase();
  if (!key) {
    throw new Error("missing_profile_username");
  }

  const cached = profileChatCache.get(key);
  if (cached) return cached;

  const promise = resolveProfileChatUncached(username).catch((error) => {
    profileChatCache.delete(key);
    throw error;
  });

  profileChatCache.set(key, promise);
  return promise;
}

async function resolveProfileChatUncached(username: string): Promise<ResolvedProfileChat> {
  const lookup = await lookupProfileByUsername(username);
  if (lookup.usernameChanged) {
    throw new ProfileUsernameChangedError(
      lookup.requestedUsername,
      lookup.currentUsername,
    );
  }

  const profile = lookup.profile;
  const targetUid = String(profile?.uid || "");
  const firebaseUid = auth.currentUser?.uid || "";
  const senderId = getChatAnonSenderId();
  const isLoggedIn = Boolean(firebaseUid);

  let chatId = buildProfileAnonChatId(senderId, lookup.currentUsername);

  if (firebaseUid && targetUid && firebaseUid === targetUid) {
    const incoming = await findOwnerIncomingChat(firebaseUid, lookup.currentUsername);
    if (incoming?.id) {
      chatId = incoming.id;
    } else {
      throw new OwnerProfileInboxRedirect();
    }
  }

  const effectiveSender = parseProfileAnonChatId(chatId).senderId.startsWith("anon_")
    ? parseProfileAnonChatId(chatId).senderId
    : senderId;
  const legacyIds = [
    ...buildLegacyProfileChatIds(effectiveSender, lookup.currentUsername, targetUid),
    ...(firebaseUid
      ? buildLegacyProfileChatIds(firebaseUid, lookup.currentUsername, targetUid)
      : []),
    ...(effectiveSender !== senderId
      ? buildLegacyProfileChatIds(senderId, lookup.currentUsername, targetUid)
      : []),
  ];

  const participantes = Array.from(
    new Set(
      [effectiveSender, senderId, firebaseUid, targetUid].filter(Boolean) as string[],
    ),
  );

  const targetPhoto = resolveProfilePhoto(profile);

  const migrationMeta = {
    id: chatId,
    canonicalChatId: chatId,
    targetUsername: lookup.currentUsername,
    receptorUsername: lookup.currentUsername,
    receptorUid: targetUid || null,
    targetUid: targetUid || null,
    initiatorUid: firebaseUid || null,
    anonOwnerUid: targetUid || null,
    anonSessionId: effectiveSender,
    participantes,
    anon: true,
    schemaVersion: 2,
    targetPhoto: targetPhoto || null,
  };

  void maybeMigrateExistingProfileChat(chatId, legacyIds, migrationMeta).catch((error) => {
    console.error("profile chat migration", error);
  });

  return {
    chatId,
    senderId: effectiveSender,
    username: lookup.currentUsername,
    targetUid,
    targetPhoto: targetPhoto || "",
    isLoggedIn,
  };
}
