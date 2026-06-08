"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { resolveStoryViewerId } from "@/lib/stories/storyAuthor";
import { refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";

export default function StoriesBootstrap() {
  useEffect(() => {
    let cancelled = false;

    const run = (viewerKey: string) => {
      if (cancelled) return;

      const schedule =
        typeof requestIdleCallback === "function"
          ? requestIdleCallback
          : (cb: () => void) => window.setTimeout(cb, 0);

      schedule(() => {
    refreshStoriesIndex(viewerKey, false).catch(() => {});
      });
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      run(resolveStoryViewerId(user));
    });

    const timer = window.setInterval(() => {
      refreshStoriesIndex(resolveStoryViewerId(auth.currentUser), false).catch(() => {});
    }, 5 * 60_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
