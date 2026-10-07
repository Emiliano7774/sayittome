"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { clearSessionShuffleLegalAcceptance } from "@/lib/legal/shuffleTerms";

/**
 * Leaving Shuffle does not rotate identity. A new anonymous identity is minted
 * only through the explicit mode/identity actions.
 */
export default function AnonSessionLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") {
      clearSessionShuffleLegalAcceptance();
    }
  }, [pathname]);

  return null;
}
