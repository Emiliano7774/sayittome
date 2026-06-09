"use client";

import { useAuth } from "@/contexts/AuthContext";
import { resolveBoostAccessState, type BoostAccessState } from "@/lib/boost/boostEligibility";

export function useBoostEligibility() {
  const { firebaseUser, profile, loading } = useAuth();

  const accessState: BoostAccessState = resolveBoostAccessState(
    firebaseUser,
    profile,
    loading,
  );

  return {
    accessState,
    authLoading: loading,
    canUseBoost: accessState === "ready",
    isGuest: accessState === "guest",
    needsProfile: accessState === "incomplete_profile",
  };
}
