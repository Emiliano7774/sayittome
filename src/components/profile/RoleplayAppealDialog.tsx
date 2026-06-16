"use client";

import { Flag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import { useT } from "@/contexts/LocaleContext";
import { auth } from "@/lib/firebase";
import { guessMediaFileKind } from "@/lib/media/fileKind";
import { uploadFileToStorage } from "@/lib/media/uploadFileToStorage";

type Props = {
  open: boolean;
  onClose: () => void;
  uid: string;
  username: string;
};

export default function RoleplayAppealDialog({ open, onClose, uid, username }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useOverlayBackClose(open, onClose, "sayittome-roleplay-appeal-open", "sayittome:close-roleplay-appeal");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (busy) return;

    const trimmed = mensaje.trim();
    if (!trimmed) {
      setError(t("roleplay_appeal_message_required"));
      return;
    }

    setBusy(true);
    setError("");

    try {
      let evidenceUrl = "";
      let evidenceKind = "";

      if (evidenceFile) {
        const kind = guessMediaFileKind(evidenceFile);
        if (!kind) {
          setError(t("roleplay_appeal_media_invalid"));
          setBusy(false);
          return;
        }

        evidenceUrl = await uploadFileToStorage({
          path: `roleplay_appeals/${uid}/${Date.now()}_${evidenceFile.name.replace(/[^\w.-]+/g, "_")}`,
          file: evidenceFile,
          kind,
          requireRegisteredUser: true,
        });
        evidenceKind = kind;
      }

      const reporter = await new Promise<{ uid: string; email: string }>((resolve) => {
        const current = auth.currentUser;
        if (current) {
          resolve({ uid: current.uid, email: current.email || "" });
          return;
        }

        const unsub = onAuthStateChanged(auth, (user) => {
          unsub();
          resolve({ uid: user?.uid || "", email: user?.email || "" });
        });
      });

      const res = await fetch("/api/roleplay-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: trimmed,
          evidenceUrl,
          evidenceKind,
          uid: reporter.uid || uid,
          username,
          reporterEmail: reporter.email,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "appeal_failed"));
      }

      alert(t("roleplay_appeal_success"));
      setMensaje("");
      setEvidenceFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onClose();
    } catch (e) {
      console.error(e);
      setError(t("roleplay_appeal_fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000000] flex items-end justify-center bg-black/85 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <div className="flex max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="shrink-0 border-b border-white/10 p-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
                <Flag size={20} />
              </span>
              <div>
                <p className="text-lg font-black text-white">{t("roleplay_appeal_title")}</p>
                <p className="text-sm font-semibold text-white/45">@{username}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
              aria-label={t("common_cancel")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <p className="text-sm font-semibold leading-relaxed text-white/70">{t("roleplay_appeal_intro")}</p>
          <p className="mt-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-xs font-semibold leading-snug text-sky-100/80">
            {t("roleplay_appeal_delay_note")}
          </p>

          <label className="mb-2 mt-5 block text-xs font-black uppercase tracking-[0.18em] text-white/45">
            {t("roleplay_appeal_message_label")}
          </label>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={8}
            className="mb-4 w-full resize-y rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white"
            placeholder={t("roleplay_appeal_message_placeholder")}
          />

          <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-white/45">
            {t("roleplay_appeal_media_label")}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
            className="mb-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-black file:text-black"
          />
          {evidenceFile ? (
            <p className="mb-4 truncate text-xs font-semibold text-white/45">{evidenceFile.name}</p>
          ) : (
            <div className="mb-4" />
          )}

          {error ? <p className="text-sm font-bold text-red-300">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t border-white/10 p-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-2xl border border-white/10 px-4 py-3.5 text-sm font-black text-white/70"
            >
              {t("common_cancel")}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="rounded-2xl bg-sky-500 px-4 py-3.5 text-sm font-black text-black disabled:opacity-50"
            >
              {busy ? t("roleplay_appeal_sending") : t("roleplay_appeal_submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
