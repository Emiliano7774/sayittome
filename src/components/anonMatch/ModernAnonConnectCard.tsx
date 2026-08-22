"use client";

import { Globe2 } from "lucide-react";
import { useCallback, useState } from "react";

import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/contexts/LocaleContext";
import { hasAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";
import { peekCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";
import { readCachedAnonCardSnapshot } from "@/lib/shuffle/shuffleChromeCache";
import {
  resolveAnonCardFirstPaint,
  resolveAnonCardIdentity,
  resolveAnonCardOccupy,
} from "@/lib/shuffle/shuffleChromeStable";

function hasActiveDirectChat(match: NonNullable<ReturnType<typeof useAnonMatchOptional>>) {
  return Boolean(
    match.openChat?.chatId &&
      match.phase === "accepted" &&
      !match.openChat.closedReason,
  );
}

export default function ModernAnonConnectCard() {
  const match = useAnonMatchOptional();
  const { firebaseUser, loading } = useAuth();
  const t = useT();
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [incognitoMode] = useState(() => hasAnonLegalAcceptance());
  const [firstPaint] = useState(() =>
    resolveAnonCardFirstPaint({
      uid: String(peekCachedViewerIdentity()?.uid || ""),
      cached: peekCachedViewerIdentity()?.uid
        ? readCachedAnonCardSnapshot(String(peekCachedViewerIdentity()?.uid || ""))
        : null,
      legalIncognito: hasAnonLegalAcceptance(),
    }),
  );

  // Hooks must run unconditionally. Early returns used to skip these and crash
  // modern Shuffle ("Rendered more hooks than during the previous render") once
  // auth/incognito became ready; ShuffleSurfaceErrorBoundary showed Recuperacion.
  const closeDisclaimer = useCallback(() => {
    setDisclaimerOpen(false);
  }, []);

  useOverlayBackClose(
    disclaimerOpen,
    closeDisclaimer,
    "sayittome-anon-disclaimer-open",
    "sayittome:close-anon-disclaimer",
  );

  const authPending = !match || loading;
  const liveProfile = Boolean(firebaseUser?.uid);
  const liveIncognito = Boolean(incognitoMode && !liveProfile);
  const identity = resolveAnonCardIdentity({
    authPending,
    firstPaint: {
      isIncognitoVisitor: firstPaint.isIncognitoVisitor,
      isProfileUser: firstPaint.isProfileUser,
    },
    live: {
      isIncognitoVisitor: liveIncognito,
      isProfileUser: liveProfile,
    },
  });
  const isIncognitoVisitor = identity.isIncognitoVisitor;
  const occupy = resolveAnonCardOccupy({
    authPending,
    firstPaintOccupy: firstPaint.occupy,
    hiddenForActiveChat: Boolean(match && !loading && hasActiveDirectChat(match)),
    liveOccupy: liveProfile || liveIncognito,
  });

  if (!occupy) return null;

  const searching = Boolean(match?.searchSessionActive || firstPaint.searching);
  const cardTitle = isIncognitoVisitor
    ? t("anon_match_card_title_anon")
    : t("anon_match_card_title");
  const disclaimerTitle = isIncognitoVisitor
    ? t("anon_match_disclaimer_title_anon")
    : t("anon_match_disclaimer_title");
  const disclaimerBody = isIncognitoVisitor
    ? t("anon_match_disclaimer_body_anon")
    : t("anon_match_disclaimer_body");
  const sectionLabel = isIncognitoVisitor
    ? t("anon_match_incognito_section")
    : t("anon_match_connect_section");

  function handleConfirmSearch() {
    closeDisclaimer();
    void match?.startSearchSession();
  }

  const shellClass =
    "mb-5 rounded-[24px] border border-violet-500/10 bg-[#080808]/90 p-4 shadow-[inset_0_0_40px_rgba(104,76,255,0.06)]";

  return (
    <>
      <section
        className={shellClass}
        data-shuffle-anon-incognito={isIncognitoVisitor ? "1" : "0"}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-black tracking-[0.18em] text-violet-200/80">{sectionLabel}</p>
          {isIncognitoVisitor ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1 text-xs font-black text-green-300">
              <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.85)]" />
              {t("anon_match_incognito_active")}
            </span>
          ) : searching ? (
            <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-black text-violet-200">
              {t("anon_match_searching")}
            </span>
          ) : null}
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-500/15 bg-violet-500/10">
            <Globe2 size={20} className="text-violet-300" strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            {isIncognitoVisitor ? (
              <>
                <p className="text-base font-black tracking-tight text-white">
                  {t("anon_match_incognito_title")}
                </p>
                <p className="mt-1 text-sm font-bold leading-snug text-white/45">
                  {t("anon_match_incognito_body")}
                </p>
                <p className="mt-3 text-base font-black tracking-tight text-white">{cardTitle}</p>
              </>
            ) : (
              <p className="text-base font-black tracking-tight text-white">{cardTitle}</p>
            )}
            {!searching ? (
              <button
                type="button"
                onClick={() => setDisclaimerOpen(true)}
                className="mt-3 w-full rounded-full bg-violet-600 px-4 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(124,58,237,0.35)] transition active:scale-[0.99]"
              >
                {t("anon_match_cta")}
              </button>
            ) : isIncognitoVisitor ? (
              <p className="mt-3 text-sm font-bold text-white/45">{t("anon_match_searching")}</p>
            ) : null}
          </div>
        </div>
      </section>

      {disclaimerOpen ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/85 px-5 backdrop-blur-md"
          onClick={closeDisclaimer}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-[28px] border border-violet-500/15 bg-[#080808] p-6 shadow-[0_0_80px_rgba(124,58,237,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="anon-match-disclaimer-title-modern"
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300/80">
              {sectionLabel}
            </p>
            <p
              id="anon-match-disclaimer-title-modern"
              className="mt-3 text-xl font-black tracking-tight text-white"
            >
              {disclaimerTitle}
            </p>
            <p className="mt-3 text-sm font-bold leading-snug text-white/45">{disclaimerBody}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeDisclaimer}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3.5 text-sm font-black text-white/65"
              >
                {t("anon_match_disclaimer_cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmSearch}
                className="rounded-2xl bg-violet-600 px-3 py-3.5 text-sm font-black text-white shadow-[0_0_20px_rgba(124,58,237,0.35)]"
              >
                {t("anon_match_disclaimer_confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
