"use client";

import { useCallback, useEffect, useState } from "react";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";
import { ANON_MATCH_DND_MINUTE_OPTIONS } from "@/lib/anonMatch/doNotDisturb";

export default function AnonMatchIncomingModal() {
  const match = useAnonMatchOptional();
  const { uxMode } = useUxMode();
  const t = useT();
  const modern = uxMode === "modern";
  const [responding, setResponding] = useState(false);
  const [dndMinutes, setDndMinutes] = useState<number>(ANON_MATCH_DND_MINUTE_OPTIONS[1]);
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

  const handleDoNotDisturb = useCallback(() => {
    if (!match || responding) return;
    setResponding(true);
    void match.enableDoNotDisturb(dndMinutes).finally(() => {
      setResponding(false);
    });
  }, [dndMinutes, match, responding]);

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

        <div
          className={
            modern
              ? "mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              : "mt-5 rounded-2xl border border-white/10 bg-white/5 p-3"
          }
        >
          <p className="text-left text-sm font-bold text-white/55">{t("anon_match_dnd_label")}</p>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={dndMinutes}
              disabled={responding}
              onChange={(event) => setDndMinutes(Number(event.target.value))}
              className={
                modern
                  ? "h-12 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-bold text-white"
                  : "h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-bold text-white"
              }
              aria-label={t("anon_match_dnd_label")}
            >
              {ANON_MATCH_DND_MINUTE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("anon_match_dnd_minutes").replace("{minutes}", String(minutes))}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={responding}
              onClick={() => void handleDoNotDisturb()}
              className={
                modern
                  ? "h-12 shrink-0 rounded-xl border border-violet-500/30 bg-violet-600/20 px-4 text-sm font-black text-violet-100"
                  : "h-12 shrink-0 rounded-xl border border-[#8C84FF]/40 bg-[#8C84FF]/15 px-4 text-sm font-black text-white"
              }
            >
              {t("anon_match_dnd_action")}
            </button>
          </div>
          <p className="mt-2 text-left text-xs font-bold text-white/35">{t("anon_match_dnd_hint")}</p>
        </div>
      </div>
    </div>
  );
}
