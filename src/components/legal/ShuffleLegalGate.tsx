"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AnonymousEntryLegalModal from "@/components/legal/AnonymousEntryLegalModal";
import { enterAnonymousMode } from "@/lib/auth/enterAnonymousMode";
import { hasAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";

export default function ShuffleLegalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [needsModal, setNeedsModal] = useState(false);

  useEffect(() => {
    const accepted = hasAnonLegalAcceptance();
    setNeedsModal(!accepted);
    setReady(true);
  }, []);

  async function handleAccept() {
    await enterAnonymousMode();
    setNeedsModal(false);
  }

  if (!ready) {
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
