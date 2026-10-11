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

function edgeTimestampMs(value: unknown): number {
  if (!value) return 0;
  const stamp = value as { toMillis?: () => number; seconds?: number };
  if (typeof stamp.toMillis === "function") return stamp.toMillis();
  if (typeof stamp.seconds === "number") return stamp.seconds * 1000;
  return 0;
}

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
  const username = String(data.username || data.usernameLower || data.nombre || "").trim();
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

    let cancelled = false;
    let snapshotGeneration = 0;
    const ref = collection(db, "usuarios", uid, "siguiendo");
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const generation = ++snapshotGeneration;
        const follows = snap.docs.map((entry) => {
          const data = entry.data();
          return {
            targetUid: String(data.seguidoUid || entry.id || "").trim(),
            followedAtMs: edgeTimestampMs(data.createdAt || data.updatedAt),
          };
        }).filter((edge) => Boolean(edge.targetUid));
        // Only fetch profile details once per followed UID. Follow metadata
        // itself stays live, but profile details never gain N live listeners.
        const missing = [...new Set(follows.map((edge) => edge.targetUid))]
          .filter((targetUid) => !profileCacheRef.current.has(targetUid));
        if (missing.length > 0) {
          // A deleted/private profile must not make every other follow vanish.
          const results = await Promise.allSettled(missing.map(loadFollowingProfile));
          if (cancelled || generation !== snapshotGeneration) return;
          for (const result of results) {
            if (result.status === "fulfilled" && result.value) {
              profileCacheRef.current.set(result.value.uid, result.value);
            }
          }
        }
        if (cancelled || generation !== snapshotGeneration) return;
        const resolvedProfiles: FollowingProfile[] = follows.flatMap(({ targetUid, followedAtMs }) => {
          const profile = profileCacheRef.current.get(targetUid);
          return profile ? [{ ...profile, followedAtMs }] : [];
        });
        const next = dedupeShuffleProfiles(resolvedProfiles)
          .sort((a, b) => (b.followedAtMs || 0) - (a.followedAtMs || 0));

        setLive({ uid, profiles: next });
        writeCachedFollowingSnapshot(uid, next, true);
      },
      (error) => {
        if (cancelled) return;
        const cachedProfiles = readCachedFollowingSnapshot(uid)?.profiles || [];
        if (!isFollowingPermissionDenied(error)) console.error("useFollowingProfiles", error);
        // Permission errors must never persist an authoritative empty list.
        setLive({ uid, profiles: cachedProfiles });
      },
    );

    return () => {
      cancelled = true;
      snapshotGeneration += 1;
      unsub();
    };
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
