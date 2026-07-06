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
  const [needsModal, setNeedsModal] = useState(() => !legalAccepted);

  useEffect(() => {
    if (legalAccepted) return;

    const accepted = hasShuffleLegalAcceptance(uid);
    if (accepted) {
      shuffleLegalGateUnlocked = true;
      markShuffleHydrated();
    }
    setNeedsModal(!accepted);
  }, [legalAccepted, loading, uid]);

  async function handleAccept() {
    if (uid) {
      setShuffleLegalAcceptance(uid);
    } else {
      await enterAnonymousMode();
    }

    shuffleLegalGateUnlocked = true;
    markShuffleHydrated();
    setNeedsModal(false);
  }

  if (legalAccepted) {
    return <>{children}</>;
  }

  if (needsModal) {
    return (
      <>
        {children}
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
