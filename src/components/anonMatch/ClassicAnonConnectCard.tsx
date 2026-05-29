"use client";

import { Globe2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/contexts/LocaleContext";
import { hasAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";

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

  function handleConfirmSearch() {
    setDisclaimerOpen(false);
    void match?.startSearchSession();
  }

  if (isIncognitoVisitor) {
    return (
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2.5">
          <Globe2 size={18} strokeWidth={1.6} className="shrink-0 text-violet-400/90" aria-hidden />
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-white/88">
            {t("anon_match_incognito_title")}
          </p>
          <span className="ml-auto h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" />
        </div>
        <p className="mt-2 pl-[26px] text-[13px] font-medium tracking-[-0.01em] text-white/42">
          {t("anon_match_incognito_body")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2.5">
          <Globe2 size={18} strokeWidth={1.6} className="shrink-0 text-violet-400/90" aria-hidden />
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-white/88">
            {t("anon_match_card_title")}
          </p>
        </div>

        {searching ? (
          <p className="mt-3 pl-[26px] text-[13px] font-medium tracking-[-0.01em] text-white/42">
            {t("anon_match_searching")}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setDisclaimerOpen(true)}
            className="mt-3 w-full rounded-xl border border-violet-500/25 bg-gradient-to-b from-[#7c3aed] to-[#5b21b6] px-4 py-3 text-[14px] font-semibold tracking-[-0.01em] text-white shadow-[0_10px_28px_rgba(91,33,182,0.38)] transition active:scale-[0.99]"
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
              {t("anon_match_disclaimer_title")}
            </p>
            <p className="mt-3 text-[13px] font-medium leading-snug tracking-[-0.01em] text-white/52">
              {t("anon_match_disclaimer_body")}
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
