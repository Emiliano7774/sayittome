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

export default function ShuffleLegalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const [ready, setReady] = useState(false);
  const [needsModal, setNeedsModal] = useState(false);

  useEffect(() => {
    if (loading) return;

    const uid = firebaseUser?.uid || "";
    const accepted = hasShuffleLegalAcceptance(uid);
    setNeedsModal(!accepted);
    setReady(true);
  }, [firebaseUser?.uid, loading]);

  async function handleAccept() {
    const uid = firebaseUser?.uid || "";

    if (uid) {
      setShuffleLegalAcceptance(uid);
    } else {
      await enterAnonymousMode();
    }

    setNeedsModal(false);
  }

  if (!ready || loading) {
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
