"use client";

import { useState } from "react";

import SensitiveConsentModal from "@/components/moderation/SensitiveConsentModal";
import { useT } from "@/contexts/LocaleContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { grantSensitiveConsent, mediaConsentKey } from "@/lib/moderation/sensitiveConsent";

type Props = {
  mediaKey?: string;
  onReveal?: () => void;
  label?: string;
};

export default function SensitiveBlurOverlay({
  mediaKey,
  onReveal,
  label = "Contenido sensible",
}: Props) {
  const { uxMode } = useUxMode();
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);

  function confirmReveal() {
    if (mediaKey) grantSensitiveConsent(mediaConsentKey(mediaKey));
    onReveal?.();
    setModalOpen(false);
  }

  const buttonClass =
    uxMode === "classic"
      ? "mt-3 border border-white/35 bg-[#222222] px-5 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
      : "relative z-10 mt-5 rounded-full border border-white/25 bg-white/10 px-8 py-3 text-sm font-black text-white active:scale-95";

  const shellClass =
    uxMode === "classic"
      ? "absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 px-4 text-center"
      : "absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-md";

  return (
    <>
      <div className={shellClass}>
        {uxMode !== "classic" ? (
          <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden />
        ) : null}
        <p
          className={
            uxMode === "classic"
              ? "text-base font-bold text-white/85"
              : "relative z-10 text-xl font-black text-white/90"
          }
        >
          {label}
        </p>
        <button type="button" onClick={() => setModalOpen(true)} className={buttonClass}>
          {t("sensitive_overlay_cta")}
        </button>
      </div>

      <SensitiveConsentModal
        open={modalOpen}
        onConfirm={confirmReveal}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
}
