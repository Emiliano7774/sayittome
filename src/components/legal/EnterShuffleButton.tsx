"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import AnonymousEntryLegalModal from "@/components/legal/AnonymousEntryLegalModal";
import { enterAnonymousMode } from "@/lib/auth/enterAnonymousMode";
import { hardNavigate, shouldHardNavigate } from "@/lib/navigation/hardNavigate";

type Props = {
  className?: string;
  label?: string;
  children?: React.ReactNode;
};

export default function EnterShuffleButton({
  className = "",
  label = "Ir al Shuffle",
  children,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    setBusy(true);

    try {
      await enterAnonymousMode();
      setOpen(false);
      if (shouldHardNavigate()) {
        hardNavigate("/shuffle");
        return;
      }
      router.push("/shuffle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} disabled={busy}>
        {children || label}
      </button>

      <AnonymousEntryLegalModal
        open={open}
        onCancel={() => setOpen(false)}
        onAccept={handleAccept}
      />
    </>
  );
}
