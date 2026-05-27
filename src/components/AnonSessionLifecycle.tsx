"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  beginFreshAnonSession,
  consumeAnonSessionReset,
  getAnonSessionId,
  markAnonSessionForReset,
} from "@/lib/chat/anonSession";
import { clearAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";
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
      clearAnonLegalAcceptance();
      return;
    }

    if (pathname === "/shuffle" && consumeAnonSessionReset()) {
      beginFreshAnonSession();
    }
  }, [pathname]);

  return null;
}
