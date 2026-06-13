"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchProfileByUsername } from "@/lib/chat/resolveProfileChat";
import { db } from "@/lib/firebase";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";

export type ModerationPhotoTarget = {
  username: string;
  uid?: string;
};

function targetKey(username: string) {
  return String(username || "").trim().toLowerCase();
}

export function useModerationProfilePhotos(targets: ModerationPhotoTarget[]) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const resolvedRef = useRef<Set<string>>(new Set());

  const signature = useMemo(
    () =>
      targets
        .map((target) => `${targetKey(target.username)}:${target.uid || ""}`)
        .filter(Boolean)
        .sort()
        .join("|"),
    [targets],
  );

  useEffect(() => {
    if (!signature) return;

    const pending = targets.filter((target) => {
      const key = targetKey(target.username);
      return key && !resolvedRef.current.has(key);
    });

    if (pending.length === 0) return;

    let cancelled = false;

    void (async () => {
      const next: Record<string, string> = {};

      for (const target of pending) {
        const key = targetKey(target.username);
        if (!key || resolvedRef.current.has(key)) continue;

        let photo = "";

        if (target.uid) {
          try {
            const snap = await getDoc(doc(db, "usuarios", target.uid));
            if (snap.exists()) {
              photo = resolveProfilePhoto(snap.data());
            }
          } catch {
            // try username lookup
          }
        }

        if (!photo) {
          try {
            const profile = await fetchProfileByUsername(target.username);
            photo = resolveProfilePhoto(profile);
          } catch {
            // no photo
          }
        }

        resolvedRef.current.add(key);
        if (photo) next[key] = photo;
      }

      if (!cancelled && Object.keys(next).length > 0) {
        setPhotos((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signature, targets]);

  return photos;
}
