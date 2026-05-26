"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import {
  DEFAULT_ABUSE_BLOCK_MINUTES,
  createAnonAbuseBlock,
} from "@/lib/abuse/anonAbuseBlocks";
import { buildAbuseFingerprint, getVisitorId } from "@/lib/abuse/fingerprint";

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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reportAbuse(motivo: string, durationMinutes = DEFAULT_ABUSE_BLOCK_MINUTES) {
    if (!receptorUid || busy) return;

    setBusy(true);

    try {
      const visitorId = getVisitorId();
      const fingerprint = buildAbuseFingerprint(blockedAnonId, visitorId);

      await createAnonAbuseBlock({
        receptorUid,
        blockedAnonId,
        blockedVisitorId: visitorId,
        chatId,
        motivo,
        blockedBy,
        durationMinutes,
      });

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
      alert("Usuario bloqueado. No podrá volver a escribirte por ahora.");
    } catch (e) {
      console.error(e);
      alert("No se pudo aplicar el bloqueo antiacoso.");
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
        aria-label="Protección antiacoso"
      >
        <ShieldAlert size={16} />
        Antiacoso
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/15 bg-[#111] p-2 z-50 shadow-2xl">
          <button
            type="button"
            disabled={busy}
            onClick={() => reportAbuse("denuncia_acoso", DEFAULT_ABUSE_BLOCK_MINUTES)}
            className="w-full text-left rounded-xl px-4 py-3 font-black hover:bg-white/5 disabled:opacity-50"
          >
            Denunciar acoso
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reportAbuse("bloqueo_30m", 30)}
            className="w-full text-left rounded-xl px-4 py-3 font-black hover:bg-white/5 disabled:opacity-50"
          >
            Bloquear 30 min
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reportAbuse("bloqueo_anon", 24 * 60)}
            className="w-full text-left rounded-xl px-4 py-3 font-black hover:bg-white/5 disabled:opacity-50"
          >
            Bloquear usuario anónimo
          </button>
        </div>
      ) : null}
    </div>
  );
}
