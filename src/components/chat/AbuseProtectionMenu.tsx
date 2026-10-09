"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import { PROFILE_ANON_ABUSE_BLOCK_MINUTES } from "@/lib/abuse/profileAnonAbuseBlock";
import { auth } from "@/lib/firebase";
import { useT } from "@/contexts/LocaleContext";

export default function AbuseProtectionMenu({
  chatId,
  onBlocked,
}: {
  /** @deprecated unused — owner derived server-side */
  receptorUid?: string;
  targetUsername?: string;
  chatId: string;
  blockedAnonId?: string;
  blockedBy?: string;
  onBlocked?: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function blockThirtyMinutes() {
    if (!chatId || busy) return;
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("unauthenticated");
      const idToken = await user.getIdToken();

      const blockRes = await fetch("/api/abuse/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          chatId,
          motivo: "bloqueo_30m",
        }),
      });

      const blockJson = (await blockRes.json()) as { ok?: boolean; error?: string };
      if (!blockRes.ok || !blockJson?.ok) {
        throw new Error(String(blockJson?.error || "block_failed"));
      }

      onBlocked?.();
      alert(t("abuse_block_success"));
    } catch (e) {
      console.error(e);
      alert(t("abuse_block_fail"));
    } finally {
      setBusy(false);
    }
  }

  if (!chatId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => void blockThirtyMinutes()}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-black text-white/80 flex items-center gap-2 disabled:opacity-50"
        aria-label={t("abuse_menu_label")}
        title={t("abuse_block_30m")}
      >
        <ShieldAlert size={16} />
        {t("abuse_block_30m")}
      </button>
      <span className="sr-only">
        {PROFILE_ANON_ABUSE_BLOCK_MINUTES}m
      </span>
    </div>
  );
}
