"use client";

import { useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { revokeAllSensitiveConsent } from "@/lib/moderation/sensitiveConsent";

export default function SensitiveConsentBootstrap() {
  const hadUserRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (hadUserRef.current && !user) {
        revokeAllSensitiveConsent();
      }
      hadUserRef.current = Boolean(user);
    });

    return () => unsub();
  }, []);

  return null;
}
