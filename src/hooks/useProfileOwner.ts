"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { auth, db } from "@/lib/firebase";

type OwnerState = {
  ready: boolean;
  isOwner: boolean;
  uid: string;
};

const idle: OwnerState = { ready: false, isOwner: false, uid: "" };

/** True only when the signed-in user owns this public profile. */
export function useProfileOwner(profileUid?: string, profileUsername?: string) {
  const [state, setState] = useState<OwnerState>(idle);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user?.uid) {
        setState({ ready: true, isOwner: false, uid: "" });
        return;
      }

      const wantedUsername = String(profileUsername || "").trim().toLowerCase();
      const profileUidClean = String(profileUid || "").trim();

      if (profileUidClean && user.uid === profileUidClean) {
        setState({ ready: true, isOwner: true, uid: user.uid });
        return;
      }

      if (!wantedUsername) {
        setState({ ready: true, isOwner: false, uid: user.uid });
        return;
      }

      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (!snap.exists()) {
          setState({ ready: true, isOwner: false, uid: user.uid });
          return;
        }

        const data = snap.data() as {
          username?: string;
          usernameLower?: string;
          nombre?: string;
        };

        const mine = String(
          data.usernameLower || data.username || data.nombre || "",
        )
          .trim()
          .toLowerCase();

        setState({
          ready: true,
          isOwner: mine === wantedUsername,
          uid: user.uid,
        });
      } catch {
        setState({ ready: true, isOwner: false, uid: user.uid });
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [profileUid, profileUsername]);

  return state;
}
