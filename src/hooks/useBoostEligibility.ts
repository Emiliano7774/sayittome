"use client";

import { useAuth } from "@/contexts/AuthContext";
import { resolveBoostAccessState, type BoostAccessState } from "@/lib/boost/boostEligibility";
import {
  isBoostSequenceHandoffSuppressActive,
} from "@/lib/boost/boostHandoffSuppress";
import { isBoostPrepaintHandoffActive } from "@/lib/boost/boostPrepaintHandoff";

export {
  armBoostSequenceHandoffSuppress,
  isBoostSequenceHandoffSuppressActive,
} from "@/lib/boost/boostHandoffSuppress";

/**
 * Once Boost has resolved a non-loading gate (guest/ready/incomplete), suppress
 * transient auth.loading remounts of BoostAccessGate during internal handoffs.
 * Mirrors Chats inbox hydration flicker suppression.
 *
 * Also optimistically treat unresolved auth as guest during handoff when there is
 * no signed-in user yet — avoids a stuck Shuffle→Boost exit freeze while Auth
 * finishes its first tick (prod/native timing).
 *
 * Fresh-anon exact sequences can remount Boost loading text *after* settle CSS
 * clears (targeted isolated Shuffle→Boost often finishes inside the guard). Keep
 * a short post-guard grace so sequence reentry cannot flash "Cargando...".
 * SoftNavigate remounts after prior Chats hops also rely on prepaint session
 * marker + inline bootstrap so BoostAccessGate never paints "Cargando..." before
 * React rehydrates suppress. Direct cold /boost never arms this window.
 */
let lastNonLoadingBoostAccessState: Exclude<BoostAccessState, "loading"> | null =
  null;

function isBoostHandoffSettleActive() {
  if (typeof document === "undefined") return false;
  if (isBoostSequenceHandoffSuppressActive()) return true;
  if (isBoostPrepaintHandoffActive()) return true;
  const html = document.documentElement;
  const slide = html.dataset.mainTabShuffleSlide;
  // Destination-scoped: prefer Boost settle/suppress over aggregate used by Chats.
  // Also cover Boost→Shuffle while source Boost stays visible (orphan loading gap).
  return (
    html.dataset.boostHandoffSuppress === "1" ||
    html.dataset.prepaintBoostHandoffSuppress === "1" ||
    html.dataset.boostPostCommitSettle === "1" ||
    html.dataset.shufflePostAuthSettle === "1" ||
    html.classList.contains("sayittome-main-tab-handoff-pending") ||
    html.classList.contains("sayittome-shuffle-exit-handoff-pending") ||
    html.classList.contains("sayittome-shuffle-handoff-pending") ||
    (html.dataset.shuffleExitHandoffTarget === "/boost" &&
      html.classList.contains("sayittome-shuffle-exit-handoff-pending")) ||
    slide === "preparing" ||
    slide === "armed" ||
    slide === "running"
  );
}

export function useBoostEligibility() {
  const { firebaseUser, profile, loading } = useAuth();

  let accessState: BoostAccessState = resolveBoostAccessState(
    firebaseUser,
    profile,
    loading,
  );

  if (accessState === "loading" && isBoostHandoffSettleActive()) {
    if (lastNonLoadingBoostAccessState) {
      accessState = lastNonLoadingBoostAccessState;
    } else if (!firebaseUser || firebaseUser.isAnonymous) {
      // Fresh-anon / guest: do not mount BoostAccessGate loading during handoff.
      // TAB_HANDOFF_BOOST_ACCESS_GATE_INTERNAL_SUPPRESS
      accessState = "guest";
    }
  }

  if (accessState !== "loading") {
    lastNonLoadingBoostAccessState = accessState;
  }

  return {
    accessState,
    authLoading: loading,
    canUseBoost: accessState === "ready",
    isGuest: accessState === "guest",
    needsProfile: accessState === "incomplete_profile",
  };
}
