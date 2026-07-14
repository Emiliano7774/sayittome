"use client";

import { useAuth } from "@/contexts/AuthContext";
import { resolveBoostAccessState, type BoostAccessState } from "@/lib/boost/boostEligibility";

/**
 * Once Boost has resolved a non-loading gate (guest/ready/incomplete), suppress
 * transient auth.loading remounts of BoostAccessGate during internal handoffs.
 * Mirrors Chats inbox hydration flicker suppression.
 *
 * Also optimistically treat unresolved auth as guest during handoff when there is
 * no signed-in user yet — avoids a stuck Shuffle→Boost exit freeze while Auth
 * finishes its first tick (prod/native timing).
 */
let lastNonLoadingBoostAccessState: Exclude<BoostAccessState, "loading"> | null =
  null;

function isBoostHandoffSettleActive() {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  return (
    html.dataset.boostPostCommitSettle === "1" ||
    html.dataset.tabPostAuthSettle === "1" ||
    html.classList.contains("sayittome-main-tab-handoff-pending") ||
    html.classList.contains("sayittome-shuffle-exit-handoff-pending")
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
