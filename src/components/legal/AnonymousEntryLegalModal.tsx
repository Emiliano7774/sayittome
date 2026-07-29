"use client";

import {
  Cake,
  EyeOff,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  CircleAlert,
} from "lucide-react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import type { MessageKey } from "@/lib/i18n/getMessage";

type Props = {
  open: boolean;
  onCancel: () => void;
  onAccept: () => void | Promise<void>;
};

const BULLET_ICONS = {
  sesion: RefreshCw,
  edad: Cake,
  anonimato: EyeOff,
  seguridad: ShieldAlert,
  responsabilidad: Scale,
  ilegal: CircleAlert,
} as const;

const BULLET_KEYS: Record<
  keyof typeof BULLET_ICONS,
  { title: MessageKey; body: MessageKey }
> = {
  sesion: { title: "legal_session_title", body: "legal_session_body" },
  edad: { title: "legal_age_title", body: "legal_age_body" },
  anonimato: { title: "legal_anon_title", body: "legal_anon_body" },
  seguridad: { title: "legal_security_title", body: "legal_security_body" },
  responsabilidad: { title: "legal_responsibility_title", body: "legal_responsibility_body" },
  ilegal: { title: "legal_illegal_title", body: "legal_illegal_body" },
};

export default function AnonymousEntryLegalModal({ open, onCancel, onAccept }: Props) {
  useOverlayBackClose(
    open,
    onCancel,
    "sayittome-entry-legal-open",
    "sayittome:close-entry-legal",
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <AnonymousEntryLegalModalBody onCancel={onCancel} onAccept={onAccept} />
  );
}

function AnonymousEntryLegalModalBody({
  onCancel,
  onAccept,
}: {
  onCancel: () => void;
  onAccept: () => void | Promise<void>;
}) {
  const t = useT();
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(false);

  async function handleAccept() {
    if (!accepted || accepting) return;
    setAccepting(true);
    setAcceptError(false);
    try {
      await onAccept();
    } catch (error) {
      console.error(error);
      setAcceptError(true);
      setAccepting(false);
    }
  }

  return (
    <div
      className="sayittome-entry-legal-modal fixed inset-0 z-[100500] flex min-h-[100dvh] flex-col bg-[#050508]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anon-legal-title"
    >
      <div className="sayittome-entry-legal-scroll flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5D5FEF] to-[#8C84FF] shadow-[0_0_8px_rgba(108,99,255,0.35)]">
                <ShieldCheck size={21} className="text-white" />
              </div>
              <h2
                id="anon-legal-title"
                className="pt-1 text-[22px] font-black leading-tight tracking-[-0.035em] text-white"
              >
                {t("legal_title")}
              </h2>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70"
              aria-label={t("common_cancel")}
            >
              <X size={22} />
            </button>
          </div>

          <p className="text-[13.5px] font-bold leading-[1.38] text-white/78">{t("legal_intro")}</p>

          <div className="mt-3 space-y-3">
            {(Object.keys(BULLET_KEYS) as Array<keyof typeof BULLET_KEYS>).map((id) => {
              const Icon = BULLET_ICONS[id];
              const keys = BULLET_KEYS[id];

              return (
                <div key={id} className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{t(keys.title)}</p>
                    <p className="mt-1 text-[13px] leading-[1.38] text-white/70">{t(keys.body)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            data-legal-accept-toggle="1"
            onClick={() => setAccepted((value) => !value)}
            className={[
              "mt-4 flex w-full items-start gap-2.5 rounded-[18px] border px-[13px] py-3 text-left transition",
              accepted
                ? "border-[#9D96FF] bg-[#6C63FF]/18"
                : "border-white/10 bg-white/[0.055]",
            ].join(" ")}
          >
            <span
              className={[
                "mt-0.5 inline-flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border",
                accepted
                  ? "border-violet-300 bg-violet-500/30 text-violet-200"
                  : "border-white/25 text-white/45",
              ].join(" ")}
            >
              {accepted ? "✓" : "○"}
            </span>
            <span
              className={[
                "text-[12.8px] font-black leading-[1.28]",
                accepted ? "text-white" : "text-white/55",
              ].join(" ")}
            >
              {t("legal_declaration")}
            </span>
          </button>
        </div>
      </div>

      <div className="sayittome-entry-legal-actions shrink-0 border-t border-white/10 bg-[#07070B]/98 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-lg gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[18px] border border-white/10 py-3.5 text-sm font-extrabold text-white/62"
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            data-legal-accept-submit="1"
            disabled={!accepted || accepting}
            onClick={handleAccept}
            className={[
              "flex-1 rounded-[18px] py-3.5 text-sm font-black text-white transition",
              accepted && !accepting
                ? "bg-[#6C63FF]"
                : "cursor-not-allowed bg-white/12 text-white/35",
            ].join(" ")}
          >
            {accepting ? `${t("legal_accept")}…` : t("legal_accept")}
          </button>
        </div>
        {acceptError ? (
          <p role="alert" className="mx-auto mt-2 w-full max-w-lg text-center text-xs font-bold text-red-300">
            {t("legal_accept_error")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
