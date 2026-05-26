"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import {
  DEFAULT_ABUSE_BLOCK_MINUTES,
} from "@/lib/abuse/anonAbuseBlocks";
import { buildVisitorBlockKey, getVisitorId } from "@/lib/abuse/fingerprint";
import { useT } from "@/contexts/LocaleContext";

export default function AbuseProtectionMenu({
  receptorUid,
  targetUsername,
  chatId,
  blockedAnonId,
  blockedBy,
  onBlocked,
}: {
  receptorUid: string;
  targetUsername: string;
  chatId: string;
  blockedAnonId: string;
  blockedBy: string;
  onBlocked?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reportAbuse(motivo: string, durationMinutes = DEFAULT_ABUSE_BLOCK_MINUTES) {
    if (!receptorUid || busy) return;

    setBusy(true);

    try {
      const visitorId = getVisitorId();
      const fingerprint = buildVisitorBlockKey(visitorId);

      const blockRes = await fetch("/api/abuse/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receptorUid,
          blockedAnonId,
          blockedVisitorId: visitorId,
          chatId,
          motivo,
          blockedBy,
          durationMinutes,
        }),
      });

      const blockJson = await blockRes.json();
      if (!blockRes.ok || !blockJson?.ok) {
        throw new Error(String(blockJson?.error || "block_failed"));
      }

      await fetch("/api/abuse/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "acoso",
          motivo,
          detalle: `Bloqueo ${durationMinutes}m en chat con ${targetUsername}`,
          targetUid: receptorUid,
          targetUsername,
          reporterUid: blockedBy,
          chatId,
          blockedFingerprint: fingerprint,
        }),
      });

      onBlocked?.();
      setOpen(false);
      alert(t("abuse_block_success"));
    } catch (e) {
      console.error(e);
      alert(t("abuse_block_fail"));
    } finally {
      setBusy(false);
    }
  }

  if (!receptorUid) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-black text-white/80 flex items-center gap-2"
        aria-label={t("abuse_menu_label")}
      >
        <ShieldAlert size={16} />
        {t("abuse_menu_short")}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/15 bg-[#111] p-2 z-50 shadow-2xl">
          <button
            type="button"
            disabled={busy}
            onClick={() => reportAbuse("denuncia_acoso", DEFAULT_ABUSE_BLOCK_MINUTES)}
            className="w-full text-left rounded-xl px-4 py-3 font-black hover:bg-white/5 disabled:opacity-50"
          >
            {t("abuse_report")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reportAbuse("bloqueo_30m", 30)}
            className="w-full text-left rounded-xl px-4 py-3 font-black hover:bg-white/5 disabled:opacity-50"
          >
            {t("abuse_block_30m")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reportAbuse("bloqueo_anon", 24 * 60)}
            className="w-full text-left rounded-xl px-4 py-3 font-black hover:bg-white/5 disabled:opacity-50"
          >
            {t("abuse_block_anon")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
