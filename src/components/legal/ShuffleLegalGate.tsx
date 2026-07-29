"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import AnonymousEntryLegalModal from "@/components/legal/AnonymousEntryLegalModal";
import { useAuth } from "@/contexts/AuthContext";
import { enterAnonymousMode } from "@/lib/auth/enterAnonymousMode";
import { markShuffleHydrated } from "@/hooks/useShuffleReady";
import {
  hasPersistedShuffleLegalUnlock,
  hasShuffleLegalAcceptance,
  persistShuffleLegalUnlock,
  setShuffleLegalAcceptance,
} from "@/lib/legal/shuffleTerms";
import {
  isInstantShuffleReturnPending,
  isShuffleKeepAliveVisible,
} from "@/lib/navigation/shuffleKeepAlive";

let shuffleLegalGateUnlocked =
  typeof window !== "undefined" && hasPersistedShuffleLegalUnlock();

function unlockShuffleLegalGate() {
  shuffleLegalGateUnlocked = true;
  persistShuffleLegalUnlock();
  markShuffleHydrated();
}

function isShuffleLegalGateUnlocked(uid?: string | null) {
  if (shuffleLegalGateUnlocked) return true;
  if (typeof window === "undefined") return false;
  if (!hasShuffleLegalAcceptance(uid)) return false;
  unlockShuffleLegalGate();
  return true;
}

export default function ShuffleLegalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { firebaseUser, loading } = useAuth();
  const [acceptedInThisMount, setAcceptedInThisMount] = useState(false);
  const uid = firebaseUser?.uid || "";
  const legalAccepted = acceptedInThisMount || isShuffleLegalGateUnlocked(uid);
  const shuffleLayerVisible =
    isShuffleKeepAliveVisible(pathname) || isInstantShuffleReturnPending();

  async function handleAccept() {
    // Persist + dismiss synchronously first. Waiting on anonymous auth before
    // unlock left the authenticated keepalive gate stuck whenever React had no
    // other render signal, and left anonymous stuck if auth was slow/offline.
    setShuffleLegalAcceptance(uid || null);
    unlockShuffleLegalGate();
    setAcceptedInThisMount(true);

    if (!uid) {
      await enterAnonymousMode();
    }
  }

  if (legalAccepted || loading || !shuffleLayerVisible) {
    return <>{children}</>;
  }

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
