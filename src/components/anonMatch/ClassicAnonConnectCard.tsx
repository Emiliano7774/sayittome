"use client";

import { Globe2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClassicShuffleDensity } from "@/hooks/useClassicShuffleDensity";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import { useT } from "@/contexts/LocaleContext";
import { hasAnonLegalAcceptance } from "@/lib/legal/anonEntryTerms";
import { peekCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";
import { getClassicShuffleHeaderUi } from "@/lib/shuffle/classicHeaderUi";
import {
  readCachedAnonCardSnapshot,
  writeCachedAnonCardSnapshot,
} from "@/lib/shuffle/shuffleChromeCache";
import { decideAnonCardChrome, commitAnonSlotHeight, classicAnonSlotStyles } from "@/lib/shuffle/shuffleChromeStable";

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
  const ui = getClassicShuffleHeaderUi(density);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [anonCommitPx, setAnonCommitPx] = useState<number | null>(null);
  const incognitoMode = hasAnonLegalAcceptance();

  const closeDisclaimer = useCallback(() => {
    setDisclaimerOpen(false);
  }, [setDisclaimerOpen]);

  useOverlayBackClose(
    disclaimerOpen,
    closeDisclaimer,
    "sayittome-anon-disclaimer-open",
    "sayittome:close-anon-disclaimer",
  );

  const uid = String(
    firebaseUser?.uid ||
      (loading ? peekCachedViewerIdentity()?.uid || "" : "") ||
      "",
  );
  const authPending = !match || loading;
  const cached = uid ? readCachedAnonCardSnapshot(uid) : null;
  const isProfileUser = authPending ? Boolean(cached?.isProfileUser || uid) : Boolean(uid);
  const isIncognitoVisitor = authPending
    ? Boolean(cached?.isIncognitoVisitor || (incognitoMode && !isProfileUser))
    : incognitoMode && !isProfileUser;
  const searching = authPending
    ? Boolean(cached?.searching)
    : Boolean(match?.searchSessionActive);
  const decision = decideAnonCardChrome({
    authPending,
    uid,
    cached,
    hasActiveDirectChat: !authPending && match ? hasActiveDirectChat(match) : false,
    isProfileUser,
    isIncognitoVisitor,
    searching,
  });
  const committedPx = commitAnonSlotHeight({
    previousPx: anonCommitPx,
    density,
    authPending,
    visibility: decision.visibility,
    hiddenForActiveChat: decision.hiddenForActiveChat,
    incognito: isIncognitoVisitor,
  });
  if (anonCommitPx !== committedPx) {
    setAnonCommitPx(committedPx);
  }
  const occupy = committedPx > 0;
  const slotBox = classicAnonSlotStyles(ui, occupy, {
    incognito: isIncognitoVisitor,
  });

  useEffect(() => {
    if (authPending) return;
    writeCachedAnonCardSnapshot({
      uid,
      show: decision.visibility === "show",
      hiddenForActiveChat: decision.hiddenForActiveChat,
      isIncognitoVisitor: decision.isIncognitoVisitor,
      isProfileUser: decision.isProfileUser,
      searching: decision.searching,
    });
  }, [
    authPending,
    uid,
    decision.visibility,
    decision.hiddenForActiveChat,
    decision.isIncognitoVisitor,
    decision.isProfileUser,
    decision.searching,
  ]);

  const cardTitle = decision.isIncognitoVisitor
    ? t("anon_match_card_title_anon")
    : t("anon_match_card_title");
  const disclaimerTitle = decision.isIncognitoVisitor
    ? t("anon_match_disclaimer_title_anon")
    : t("anon_match_disclaimer_title");
  const disclaimerBody = decision.isIncognitoVisitor
    ? t("anon_match_disclaimer_body_anon")
    : t("anon_match_disclaimer_body");

  function handleConfirmSearch() {
    closeDisclaimer();
    void match?.startSearchSession();
  }

  if (!occupy) return null;

  const slotStyle = {
    marginTop: slotBox.marginTop,
    paddingTop: slotBox.paddingTop,
    marginBottom: slotBox.marginBottom,
    minHeight: slotBox.minHeight,
    height: slotBox.height,
    overflow: slotBox.overflow,
  };

  if (decision.visibility === "hidden" || decision.visibility === "reserved") {
    return (
      <div
        className="border-t border-white/[0.06]"
        style={slotStyle}
        data-shuffle-anon-slot="1"
        data-shuffle-anon-state={decision.visibility}
        data-shuffle-anon-incognito={isIncognitoVisitor ? "1" : "0"}
        data-shuffle-anon-commit={String(committedPx)}
        aria-hidden
      >
        {decision.visibility === "reserved" ? (
          <>
            <div className="flex items-center" style={{ gap: ui.followingGapPx }}>
              <div
                className="rounded-full bg-white/[0.06]"
                style={{ width: ui.anonIconPx, height: ui.anonIconPx }}
              />
              <div
                className="rounded-full bg-white/[0.06]"
                style={{ height: ui.anonTitlePx, width: "42%" }}
              />
            </div>
            <div
              className="mt-1.5 w-full rounded-lg bg-white/[0.06]"
              style={{ height: ui.anonBtnPadYPx * 2 + ui.anonBtnPx }}
            />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div
        className="border-t border-white/[0.06]"
        style={slotStyle}
        data-shuffle-anon-slot="1"
        data-shuffle-anon-state="show"
        data-shuffle-anon-incognito={isIncognitoVisitor ? "1" : "0"}
        data-shuffle-anon-commit={String(committedPx)}
      >
        {decision.isIncognitoVisitor ? (
          <>
            <div className="flex items-center" style={{ gap: ui.followingGapPx }}>
              <Globe2
                size={ui.anonIconPx}
                strokeWidth={1.6}
                className="shrink-0 text-violet-400/90"
                aria-hidden
              />
              <p
                className="font-semibold tracking-[-0.02em] text-white/88"
                style={{ fontSize: ui.anonTitlePx }}
              >
                {t("anon_match_incognito_title")}
              </p>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
            </div>
            <p
              className="mt-1.5 font-medium tracking-[-0.01em] text-white/42"
              style={{
                fontSize: ui.anonBodyPx,
                paddingLeft: ui.anonIconPx + ui.followingGapPx,
              }}
            >
              {t("anon_match_incognito_body")}
            </p>
          </>
        ) : null}

        <div
          className="flex items-center"
          style={{
            gap: ui.followingGapPx,
            marginTop: decision.isIncognitoVisitor ? ui.filterMtPx : 0,
          }}
        >
          {!decision.isIncognitoVisitor ? (
            <Globe2
              size={ui.anonIconPx}
              strokeWidth={1.6}
              className="shrink-0 text-violet-400/90"
              aria-hidden
            />
          ) : null}
          <p
            className="font-semibold tracking-[-0.02em] text-white/88"
            style={{
              fontSize: ui.anonTitlePx,
              paddingLeft: decision.isIncognitoVisitor
                ? ui.anonIconPx + ui.followingGapPx
                : 0,
            }}
          >
            {cardTitle}
          </p>
        </div>

        {decision.searching ? (
          <p
            className="mt-1.5 font-medium tracking-[-0.01em] text-white/42"
            style={{
              fontSize: ui.anonBodyPx,
              paddingLeft: ui.anonIconPx + ui.followingGapPx,
            }}
          >
            {t("anon_match_searching")}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setDisclaimerOpen(true)}
            className="mt-1.5 w-full rounded-lg border border-violet-500/25 bg-gradient-to-b from-[#7c3aed] to-[#5b21b6] px-3 font-semibold tracking-[-0.02em] text-white shadow-[0_8px_22px_rgba(91,33,182,0.32)] transition active:scale-[0.99]"
            style={{
              fontSize: ui.anonBtnPx,
              paddingBlock: ui.anonBtnPadYPx,
            }}
          >
            {t("anon_match_cta")}
          </button>
        )}
      </div>

      {disclaimerOpen ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm"
          onClick={closeDisclaimer}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-[22px] border border-white/10 bg-[#141414] p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="anon-match-disclaimer-title"
          >
            <p
              id="anon-match-disclaimer-title"
              className="text-[15px] font-semibold tracking-[-0.02em] text-white"
            >
              {disclaimerTitle}
            </p>
            <p className="mt-3 text-[13px] font-medium leading-snug tracking-[-0.01em] text-white/52">
              {disclaimerBody}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={closeDisclaimer}
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
