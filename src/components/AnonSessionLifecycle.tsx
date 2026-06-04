"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  beginFreshAnonSession,
  consumeAnonSessionReset,
  getAnonSessionId,
  markAnonSessionForReset,
} from "@/lib/chat/anonSession";
import { clearSessionShuffleLegalAcceptance } from "@/lib/legal/shuffleTerms";
import { deleteAnonymousStoriesForSession } from "@/lib/stories/anonStories";

/**
 * Visiting home marks the anonymous session as stale.
 * Entering shuffle again creates a new anonymous identity.
 */
export default function AnonSessionLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") {
      void deleteAnonymousStoriesForSession(getAnonSessionId());
      markAnonSessionForReset();
      clearSessionShuffleLegalAcceptance();
      return;
    }

    if (pathname === "/shuffle" && consumeAnonSessionReset()) {
      beginFreshAnonSession();
    }
  }, [pathname]);

  return null;
}
