"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { auth } from "@/lib/firebase";

/**
 * Cold start / reopen lands on `/`. If Firebase session is still alive,
 * skip marketing Home + "Iniciar sesión" and go straight to Shuffle (or setup).
 * Logged-out users keep the normal Home surface.
 *
 * Uses authStateReady() only (not the first onAuthStateChanged null) so a
 * restoring session is not mistaken for logged-out.
 */
export default function HomeSessionRestore({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await auth.authStateReady();
        if (cancelled) return;

        const user = auth.currentUser;
        if (!user || user.isAnonymous) {
          setReady(true);
          return;
        }

        const next = await resolvePostAuthPath(user.uid, user.emailVerified);
        if (cancelled) return;
        router.replace(next);
      } catch (error) {
        console.error("HomeSessionRestore", error);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <main
        className="min-h-screen bg-black"
        aria-busy="true"
        data-home-session-restore="1"
      />
    );
  }

  return <>{children}</>;
}
