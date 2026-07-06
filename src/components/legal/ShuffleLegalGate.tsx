"use client";

import { usePathname, useRouter } from "next/navigation";

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
  const uid = firebaseUser?.uid || "";
  const legalAccepted = isShuffleLegalGateUnlocked(uid);
  const shuffleLayerVisible =
    isShuffleKeepAliveVisible(pathname) || isInstantShuffleReturnPending();

  async function handleAccept() {
    if (uid) {
      setShuffleLegalAcceptance(uid);
    } else {
      await enterAnonymousMode();
    }

    unlockShuffleLegalGate();
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
