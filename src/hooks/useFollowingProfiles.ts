"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { peekCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";
import { withTimeout } from "@/lib/async/withTimeout";
import { isRecentlyActive } from "@/lib/presence";
import type { FollowingProfile } from "@/lib/shuffle/followingTypes";
import {
  readCachedFollowingSnapshot,
  writeCachedFollowingSnapshot,
} from "@/lib/shuffle/shuffleChromeCache";
import { decideFollowingChrome } from "@/lib/shuffle/shuffleChromeStable";
import { dedupeShuffleProfiles } from "@/lib/shuffle/dedupeProfiles";

export type { FollowingProfile } from "@/lib/shuffle/followingTypes";

function isFollowingPermissionDenied(error: unknown) {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as Error)?.message || "");
  return (
    code.includes("permission-denied") ||
    /permission-denied|PERMISSION_DENIED/i.test(message)
  );
}

async function loadFollowingProfile(targetUid: string): Promise<FollowingProfile | null> {
  const snap = await withTimeout(
    getDoc(doc(db, "usuarios", targetUid)),
    8000,
    "following_profile_timeout",
  );
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  const username = String(data.username || data.nombre || "").trim();
  if (!username) return null;

  const lastActive = String(data.presenceAt || data.lastActive || "");
  const online = data.online === true;

  const firebaseUid = String(data.uid || "").trim();
  return {
    uid: targetUid,
    authUid: firebaseUid || targetUid,
    aliasIds: [targetUid, firebaseUid].filter(Boolean),
    username,
    photo: String(data.fotoPrincipal || data.photoURL || ""),
    lastActive,
    online,
    showOnline: isRecentlyActive(lastActive, online),
  };
}

export function useFollowingProfiles() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const uid = String(
    firebaseUser?.uid ||
      auth.currentUser?.uid ||
      (authLoading ? peekCachedViewerIdentity()?.uid || "" : "") ||
      "",
  );
  const authPending = authLoading && !firebaseUser?.uid && !auth.currentUser?.uid;
  const profileCacheRef = useRef(new Map<string, FollowingProfile>());
  const [live, setLive] = useState<{ uid: string; profiles: FollowingProfile[] } | null>(
    null,
  );

  const cached = uid ? readCachedFollowingSnapshot(uid) : null;
  const liveProfiles = uid && live?.uid === uid ? live.profiles : null;
  const liveReady = Boolean(uid && live?.uid === uid);
  const decision = decideFollowingChrome({
    authPending,
    uid,
    cached,
    liveProfiles,
    liveReady,
  });

  useEffect(() => {
    if (authPending) return;
    if (!uid) {
      writeCachedFollowingSnapshot("", [], false);
      return;
    }

    const seeded = readCachedFollowingSnapshot(uid);
    if (seeded) {
      for (const profile of seeded.profiles) {
        profileCacheRef.current.set(profile.uid, profile);
      }
    }

    const ref = collection(db, "usuarios", uid, "siguiendo");
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const targetUids = snap.docs
          .map((entry) => String(entry.data().seguidoUid || entry.id || ""))
          .filter(Boolean);

        const missing = targetUids.filter((targetUid) => !profileCacheRef.current.has(targetUid));

        if (missing.length > 0) {
          const loaded = await Promise.all(missing.map((targetUid) => loadFollowingProfile(targetUid)));
          for (const profile of loaded) {
            if (profile) profileCacheRef.current.set(profile.uid, profile);
          }
        }

        const next = dedupeShuffleProfiles(
          targetUids
            .map((targetUid) => profileCacheRef.current.get(targetUid))
            .filter((profile): profile is FollowingProfile => Boolean(profile)),
        );

        setLive({ uid, profiles: next });
        writeCachedFollowingSnapshot(uid, next, true);
      },
      (error) => {
        const cachedProfiles = readCachedFollowingSnapshot(uid)?.profiles || [];
        if (!isFollowingPermissionDenied(error)) {
          console.error("useFollowingProfiles", error);
        }
        setLive({ uid, profiles: cachedProfiles });
        writeCachedFollowingSnapshot(uid, cachedProfiles, true);
      },
    );

    return () => unsub();
  }, [authPending, uid]);

  return {
    uid,
    profiles: decision.profiles,
    loading: decision.showSkeleton,
    hasSession: decision.hasSession,
    authPending,
    showGuest: decision.showGuest,
    state: decision.state,
  };
}
