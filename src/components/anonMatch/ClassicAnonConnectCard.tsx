"use client";

import { Globe2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useT } from "@/contexts/LocaleContext";
import { hasAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";
import { getClassicShuffleDensityTokens } from "@/lib/shuffle/classicDensity";

function hasActiveDirectChat(match: NonNullable<ReturnType<typeof useAnonMatchOptional>>) {
  return Boolean(
    match.openChat?.chatId &&
      match.phase === "accepted" &&
      !match.openChat.closedReason,
  );
}

export default function ClassicAnonConnectCard() {
  const match = useAnonMatchOptional();
  const { firebaseUser, loading } = useAuth();
  const t = useT();
  const { density } = useClassicShuffleDensity();
  const tokens = getClassicShuffleDensityTokens(density);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [incognitoMode, setIncognitoMode] = useState(false);

  useEffect(() => {
    setIncognitoMode(hasAnonLegalAcceptance());
  }, []);

  const isProfileUser = Boolean(firebaseUser?.uid);
  const isIncognitoVisitor = incognitoMode && !isProfileUser;

  if (!match || loading) return null;
  if (hasActiveDirectChat(match)) return null;
  if (!isProfileUser && !isIncognitoVisitor) return null;

  const searching = match.searchSessionActive;
  const cardTitle = isIncognitoVisitor
    ? t("anon_match_card_title_anon")
    : t("anon_match_card_title");
  const disclaimerTitle = isIncognitoVisitor
    ? t("anon_match_disclaimer_title_anon")
    : t("anon_match_disclaimer_title");
  const disclaimerBody = isIncognitoVisitor
    ? t("anon_match_disclaimer_body_anon")
    : t("anon_match_disclaimer_body");

  function handleConfirmSearch() {
    setDisclaimerOpen(false);
    void match?.startSearchSession();
  }

  return (
    <>
      <div className={`${tokens.anonMt} border-t border-white/[0.06] ${tokens.anonPt} ${tokens.anonMb}`}>
        {isIncognitoVisitor ? (
          <>
            <div className={`flex items-center ${tokens.filterGap}`}>
              <Globe2
                size={tokens.anonIcon}
                strokeWidth={1.6}
                className="shrink-0 text-violet-400/90"
                aria-hidden
              />
              <p className={`font-semibold tracking-[-0.02em] text-white/88 ${tokens.anonTitle}`}>
                {t("anon_match_incognito_title")}
              </p>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
            </div>
            <p className={`mt-1.5 ${tokens.anonIndent} font-medium tracking-[-0.01em] text-white/42 ${tokens.anonBody}`}>
              {t("anon_match_incognito_body")}
            </p>
          </>
        ) : null}

        <div className={`flex items-center ${tokens.filterGap} ${isIncognitoVisitor ? tokens.filterMt : ""}`}>
          {!isIncognitoVisitor ? (
            <Globe2
              size={tokens.anonIcon}
              strokeWidth={1.6}
              className="shrink-0 text-violet-400/90"
              aria-hidden
            />
          ) : null}
          <p
            className={[
              `font-semibold tracking-[-0.02em] text-white/88 ${tokens.anonTitle}`,
              isIncognitoVisitor ? tokens.anonIndent : "",
            ].join(" ")}
          >
            {cardTitle}
          </p>
        </div>

        {searching ? (
          <p className={`mt-1.5 ${tokens.anonIndent} font-medium tracking-[-0.01em] text-white/42 ${tokens.anonBody}`}>
            {t("anon_match_searching")}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setDisclaimerOpen(true)}
            className={`mt-1.5 w-full rounded-lg border border-violet-500/25 bg-gradient-to-b from-[#7c3aed] to-[#5b21b6] px-3 font-semibold tracking-[-0.02em] text-white shadow-[0_8px_22px_rgba(91,33,182,0.32)] transition active:scale-[0.99] ${tokens.anonBtnText} ${tokens.anonBtnPy}`}
          >
            {t("anon_match_cta")}
          </button>
        )}
      </div>

      {disclaimerOpen ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-[22px] border border-white/10 bg-[#141414] p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="anon-match-disclaimer-title"
          >
            <p id="anon-match-disclaimer-title" className="text-[15px] font-semibold tracking-[-0.02em] text-white">
              {disclaimerTitle}
            </p>
            <p className="mt-3 text-[13px] font-medium leading-snug tracking-[-0.01em] text-white/52">
              {disclaimerBody}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDisclaimerOpen(false)}
                className="rounded-xl border border-white/10 px-3 py-3 text-[13px] font-semibold text-white/65"
              >
                {t("anon_match_disclaimer_cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmSearch}
                className="rounded-xl border border-violet-500/25 bg-gradient-to-b from-[#7c3aed] to-[#5b21b6] px-3 py-3 text-[13px] font-semibold text-white"
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
