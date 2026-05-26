"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  beginFreshAnonSession,
  consumeAnonSessionReset,
  markAnonSessionForReset,
} from "@/lib/chat/anonSession";
import { clearAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";

/**
 * Visiting home marks the anonymous session as stale.
 * Entering shuffle again creates a new anonymous identity.
 */
export default function AnonSessionLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") {
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
