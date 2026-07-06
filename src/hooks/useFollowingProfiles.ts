"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/async/withTimeout";
import { isRecentlyActive } from "@/lib/presence";
import {
  readCachedFollowingSnapshot,
  writeCachedFollowingSnapshot,
} from "@/lib/shuffle/shuffleChromeCache";

export type FollowingProfile = {
  uid: string;
  username: string;
  photo: string;
  lastActive?: string;
  online?: boolean;
  showOnline: boolean;
};

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

  return {
    uid: targetUid,
    username,
    photo: String(data.fotoPrincipal || data.photoURL || ""),
    lastActive,
    online,
    showOnline: isRecentlyActive(lastActive, online),
  };
}

export function useFollowingProfiles() {
  const [uid, setUid] = useState("");
  const [profiles, setProfiles] = useState<FollowingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const profileCacheRef = useRef(new Map<string, FollowingProfile>());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setProfiles([]);
      setLoading(false);
      writeCachedFollowingSnapshot("", [], false);
      return;
    }

    const cached = readCachedFollowingSnapshot(uid);
    if (cached) {
      for (const profile of cached.profiles) {
        profileCacheRef.current.set(profile.uid, profile);
      }
      setProfiles(cached.profiles);
      setLoading(false);
    } else {
      setLoading(true);
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

        const next = targetUids
          .map((targetUid) => profileCacheRef.current.get(targetUid))
          .filter((profile): profile is FollowingProfile => Boolean(profile));

        setProfiles(next);
        setLoading(false);
        writeCachedFollowingSnapshot(uid, next, true);
      },
      (error) => {
        console.error("useFollowingProfiles", error);
        if (!readCachedFollowingSnapshot(uid)) {
          setProfiles([]);
        }
        setLoading(false);
      },
    );

    return () => unsub();
  }, [uid]);

  return { uid, profiles, loading, hasSession: Boolean(uid) };
}
