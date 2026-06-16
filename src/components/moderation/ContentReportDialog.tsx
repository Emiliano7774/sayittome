"use client";

import { Flag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import { useT } from "@/contexts/LocaleContext";
import { auth } from "@/lib/firebase";
import { uploadFileToStorage } from "@/lib/media/uploadFileToStorage";

export type ContentReportKind = "perfil" | "historia" | "perfil_falso";

type Props = {
  open: boolean;
  onClose: () => void;
  kind: ContentReportKind;
  targetUid?: string;
  targetUsername?: string;
  storyId?: string;
};

const REASONS: ContentReportKind[] = ["perfil_falso", "perfil", "historia"];

export default function ContentReportDialog({
  open,
  onClose,
  kind: defaultKind,
  targetUid = "",
  targetUsername = "",
  storyId = "",
}: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ContentReportKind>(defaultKind);
  const [detalle, setDetalle] = useState("");
  const [links, setLinks] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useOverlayBackClose(open, onClose, "sayittome-report-open", "sayittome:close-report");

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
  }, [defaultKind, open]);

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

    const trimmed = detalle.trim();
    if (!trimmed) {
      setError(t("report_detail_required"));
      return;
    }

    if (kind === "perfil_falso" && !evidenceFile) {
      setError(t("report_evidence_required"));
      return;
    }

    setBusy(true);
    setError("");

    try {
      let evidenceUrl = "";

      if (evidenceFile) {
        evidenceUrl = await uploadFileToStorage({
          path: `report_evidence/${Date.now()}_${evidenceFile.name.replace(/[^\w.-]+/g, "_")}`,
          file: evidenceFile,
          kind: "image",
          allowAnonymousAuth: true,
        });
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

      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: kind,
          motivo: kind,
          detalle: trimmed,
          links: links.trim(),
          evidenceUrl,
          targetUid,
          targetUsername,
          storyId,
          reporterUid: reporter.uid,
          reporterEmail: reporter.email,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "report_failed"));
      }

      alert(t("report_sent_success"));
      setDetalle("");
      setLinks("");
      setEvidenceFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onClose();
    } catch (e) {
      console.error(e);
      setError(t("report_sent_fail"));
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
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-200">
                <Flag size={20} />
              </span>
              <div>
                <p className="text-lg font-black text-white">{t("report_title")}</p>
                <p className="text-sm font-semibold text-white/45">
                  @{targetUsername || t("report_unknown_target")}
                </p>
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
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-white/45">
            {t("report_reason_label")}
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ContentReportKind)}
            className="mb-4 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white"
          >
            {REASONS.map((option) => (
              <option key={option} value={option}>
                {t(
                  option === "perfil_falso"
                    ? "report_reason_fake_profile"
                    : option === "historia"
                      ? "report_reason_story"
                      : "report_reason_profile",
                )}
              </option>
            ))}
          </select>

          {kind === "perfil_falso" ? (
            <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-black text-amber-100">{t("report_fake_profile_title")}</p>
              <p className="mt-1 text-xs font-semibold leading-snug text-amber-100/75">
                {t("report_fake_profile_hint")}
              </p>
            </div>
          ) : null}

          <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-white/45">
            {t("report_detail_label")}
          </label>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={4}
            className="mb-4 w-full resize-y rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white"
            placeholder={t("report_detail_placeholder")}
          />

          <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-white/45">
            {t("report_links_label")}
          </label>
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={2}
            className="mb-4 w-full resize-y rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white"
            placeholder={t("report_links_placeholder")}
          />

          <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-white/45">
            {kind === "perfil_falso"
              ? t("report_evidence_required_label")
              : t("report_evidence_optional_label")}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
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
              className="rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-black text-black disabled:opacity-50"
            >
              {busy ? t("report_sending") : t("report_submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
