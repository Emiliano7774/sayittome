"use client";

import { useCallback, useEffect, useState } from "react";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";

export default function AnonMatchIncomingModal() {
  const match = useAnonMatchOptional();
  const { uxMode } = useUxMode();
  const t = useT();
  const modern = uxMode === "modern";
  const [responding, setResponding] = useState(false);
  const incomingRequest = match?.incomingRequest;

  useEffect(() => {
    setResponding(false);
  }, [incomingRequest?.solicitudId]);

  const handleRespond = useCallback(
    (accept: boolean) => {
      if (!match || responding) return;
      setResponding(true);
      void match.respondIncoming(accept).finally(() => {
        setResponding(false);
      });
    },
    [match, responding],
  );

  if (!incomingRequest) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center px-4 backdrop-blur-sm ${
        modern ? "bg-black/85 backdrop-blur-md" : "bg-black/80"
      }`}
    >
      <div
        className={
          modern
            ? "w-full max-w-md rounded-[28px] border border-violet-500/15 bg-[#080808] p-6 text-center shadow-[0_0_80px_rgba(124,58,237,0.22)]"
            : "w-full max-w-md rounded-[28px] border border-[#8C84FF]/35 bg-[#111] p-6 text-center shadow-[0_0_80px_rgba(140,132,255,0.25)]"
        }
      >
        <p
          className={
            modern
              ? "text-xs font-black uppercase tracking-[0.18em] text-violet-300/80"
              : "text-xs font-black uppercase tracking-[0.18em] text-[#8C84FF]"
          }
        >
          {t("anon_match_incoming_badge")}
        </p>
        <h2 className="mt-4 text-2xl font-black leading-tight text-white">
          {t("anon_match_incoming_title")}
        </h2>
        <p className={`mt-3 text-base ${modern ? "font-bold text-white/45" : "font-bold text-white/55"}`}>
          {t("anon_match_incoming_body")}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={responding}
            onClick={() => void handleRespond(false)}
            className={
              modern
                ? "rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-base font-black text-white/70"
                : "rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-base font-black text-white/75"
            }
          >
            {t("anon_match_reject")}
          </button>
          <button
            type="button"
            disabled={responding}
            onClick={() => void handleRespond(true)}
            className={
              modern
                ? "rounded-2xl bg-violet-600 px-4 py-4 text-base font-black text-white shadow-[0_0_20px_rgba(124,58,237,0.35)]"
                : "rounded-2xl bg-[#8C84FF] px-4 py-4 text-base font-black text-black"
            }
          >
            {t("anon_match_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
