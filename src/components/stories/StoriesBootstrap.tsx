"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import { useDocumentHidden } from "@/hooks/useDocumentHidden";
import { auth } from "@/lib/firebase";
import { shouldEnableStoriesRefresh } from "@/lib/chat/inboxListenerRoutes";
import { resolveStoryViewerId } from "@/lib/stories/storyAuthor";
import { refreshStoriesIndex } from "@/lib/stories/storiesIndexStore";

const STORIES_REFRESH_MS = 10 * 60_000;

export default function StoriesBootstrap() {
  const pathname = usePathname();
  const documentHidden = useDocumentHidden();

  const storiesRouteEnabled = useMemo(
    () => shouldEnableStoriesRefresh(pathname),
    [pathname],
  );
  const pollingActive = storiesRouteEnabled && !documentHidden;

  useEffect(() => {
    if (!pollingActive) return;

    let cancelled = false;

    const run = (viewerKey: string) => {
      if (cancelled) return;
      // First refresh must not wait for idle — Stories warm path depends on it.
      refreshStoriesIndex(viewerKey, false).catch(() => {});
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      run(resolveStoryViewerId(user));
    });

    run(resolveStoryViewerId(auth.currentUser));

    const timer = window.setInterval(() => {
      refreshStoriesIndex(resolveStoryViewerId(auth.currentUser), false).catch(
        () => {},
      );
    }, STORIES_REFRESH_MS);

    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(timer);
    };
  }, [pollingActive]);

  return null;
}
