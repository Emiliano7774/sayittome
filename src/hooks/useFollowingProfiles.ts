"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { isRecentlyActive } from "@/lib/presence";

export type FollowingProfile = {
  uid: string;
  username: string;
  photo: string;
  lastActive?: string;
  online?: boolean;
  showOnline: boolean;
};

async function loadFollowingProfile(targetUid: string): Promise<FollowingProfile | null> {
  const snap = await getDoc(doc(db, "usuarios", targetUid));
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
  const [loading, setLoading] = useState(true);

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
      return;
    }

    setLoading(true);

    const ref = collection(db, "usuarios", uid, "siguiendo");

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const targetUids = snap.docs
          .map((entry) => String(entry.data().seguidoUid || entry.id || ""))
          .filter(Boolean);

        const loaded = await Promise.all(targetUids.map((targetUid) => loadFollowingProfile(targetUid)));
        setProfiles(loaded.filter((profile): profile is FollowingProfile => Boolean(profile)));
        setLoading(false);
      },
      (error) => {
        console.error("useFollowingProfiles", error);
        setProfiles([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [uid]);

  return { uid, profiles, loading, hasSession: Boolean(uid) };
}
