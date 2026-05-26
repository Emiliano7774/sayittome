"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";

export default function StoriesBootstrap() {
  useEffect(() => {
    let cancelled = false;

    const run = (viewerUid: string) => {
      if (cancelled) return;

      const schedule =
        typeof requestIdleCallback === "function"
          ? requestIdleCallback
          : (cb: () => void) => window.setTimeout(cb, 0);

      schedule(() => {
        refreshStoriesIndex(viewerUid, true).catch(() => {});
      });
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      run(user?.uid || "");
    });

    const timer = window.setInterval(() => {
      refreshStoriesIndex(auth.currentUser?.uid || "", false).catch(() => {});
    }, 60_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
