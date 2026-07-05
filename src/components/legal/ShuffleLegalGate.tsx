"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AnonymousEntryLegalModal from "@/components/legal/AnonymousEntryLegalModal";
import { useAuth } from "@/contexts/AuthContext";
import { enterAnonymousMode } from "@/lib/auth/enterAnonymousMode";
import {
  hasShuffleLegalAcceptance,
  setShuffleLegalAcceptance,
} from "@/lib/legal/shuffleTerms";
import { markShuffleHydrated } from "@/hooks/useShuffleReady";

let shuffleLegalGateUnlocked = false;

function isShuffleLegalGateUnlocked(uid?: string | null) {
  if (shuffleLegalGateUnlocked) return true;
  if (typeof window === "undefined") return false;
  if (!hasShuffleLegalAcceptance(uid)) return false;
  shuffleLegalGateUnlocked = true;
  markShuffleHydrated();
  return true;
}

export default function ShuffleLegalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const uid = firebaseUser?.uid || "";
  const legalAccepted = isShuffleLegalGateUnlocked(uid);
  const [ready, setReady] = useState(() => legalAccepted);
  const [needsModal, setNeedsModal] = useState(() => !legalAccepted);
  const [authGraceReady, setAuthGraceReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setAuthGraceReady(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (legalAccepted) return;
    if (loading && !authGraceReady) return;

    const accepted = hasShuffleLegalAcceptance(uid);
    if (accepted) {
      shuffleLegalGateUnlocked = true;
    }
    setNeedsModal(!accepted);
    setReady(true);
  }, [authGraceReady, legalAccepted, loading, uid]);

  async function handleAccept() {
    if (uid) {
      setShuffleLegalAcceptance(uid);
    } else {
      await enterAnonymousMode();
    }

    shuffleLegalGateUnlocked = true;
    setNeedsModal(false);
  }

  if (legalAccepted) {
    return <>{children}</>;
  }

  if ((!ready || loading) && !authGraceReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-white/40">Cargando...</p>
      </main>
    );
  }

  if (needsModal) {
    return (
      <>
        <main className="min-h-screen bg-black" />
        <AnonymousEntryLegalModal
          open
          onCancel={() => router.replace("/")}
          onAccept={handleAccept}
        />
      </>
    );
  }

  return <>{children}</>;
}
