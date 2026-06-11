"use client";

import { useT } from "@/contexts/LocaleContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function SensitiveConsentModal({ open, onConfirm, onCancel }: Props) {
  const t = useT();
  const { uxMode } = useUxMode();

  useOverlayBackClose(
    open,
    onCancel,
    "sayittome-sensitive-consent-open",
    "sayittome:close-sensitive-consent",
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={[
          "w-full max-w-md border bg-[#0d0d12] p-6 shadow-2xl",
          uxMode === "classic"
            ? "rounded-[1.75rem] border-white/12"
            : "rounded-[2rem] border-violet-400/20 shadow-violet-950/40",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensitive-consent-title"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300/80">
          {t("sensitive_modal_kicker")}
        </p>
        <h2 id="sensitive-consent-title" className="mt-3 text-2xl font-black text-white">
          {t("sensitive_modal_title")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/65">{t("sensitive_modal_body")}</p>
        <p className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/45">
          {t("sensitive_modal_session_note")}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "flex-1 px-5 py-3.5 text-sm font-black text-white transition active:scale-[0.98]",
              uxMode === "classic"
                ? "rounded-full bg-violet-500"
                : "rounded-full bg-violet-500/90 shadow-[0_0_30px_rgba(139,92,246,0.25)]",
            ].join(" ")}
          >
            {t("sensitive_modal_confirm")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-5 py-3.5 text-sm font-semibold text-white/70 transition hover:text-white"
          >
            {t("sensitive_modal_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
