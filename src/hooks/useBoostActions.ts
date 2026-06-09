"use client";

import { useCallback, useState } from "react";

import { useLocale } from "@/contexts/LocaleContext";
import { useBoostEligibility } from "@/hooks/useBoostEligibility";
import { useBoostStatus } from "@/hooks/useBoostStatus";

export function formatBoostRemaining(untilMs: number) {
  const diff = Math.max(0, untilMs - Date.now());
  const mins = Math.ceil(diff / 60_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

export function useBoostActions(enabled = true) {
  const { accessState, canUseBoost, isGuest } = useBoostEligibility();
  const { t } = useLocale();
  const { status, loading, activate, refresh } = useBoostStatus(enabled && canUseBoost);
  const [activating, setActivating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);

  const credits = status?.boostCreditsMinutes ?? 0;
  const activeUntil = status?.activeBoostUntil ?? null;
  const isActive = activeUntil != null && activeUntil > Date.now();

  const handleActivate = useCallback(async () => {
    if (!canUseBoost) {
      setFeedback(t(isGuest ? "boost_guest_body" : "boost_profile_required_body"));
      return;
    }

    setActivating(true);
    setFeedback("");
    const result = await activate();
    setActivating(false);

    if (result.ok) {
      setFeedback(t("boost_activate_success"));
      return;
    }

    const reason = String(result.reason || result.error || "");
    if (
      reason === "insufficient_credits" ||
      reason === "already_active" ||
      reason === "not_authenticated" ||
      reason === "no_profile"
    ) {
      setFeedback(t(`boost_error_${reason}` as "boost_error_insufficient_credits"));
    } else {
      setFeedback(t("boost_error_unknown"));
    }
  }, [activate, canUseBoost, isGuest, t]);

  const handleCopy = useCallback(async () => {
    if (!canUseBoost) return;

    const link = status?.referralLink;
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback(t("boost_copy_fail"));
    }
  }, [canUseBoost, status?.referralLink, t]);

  return {
    accessState,
    canUseBoost,
    isGuest,
    status,
    loading,
    refresh,
    activating,
    feedback,
    copied,
    credits,
    activeUntil,
    isActive,
    handleActivate,
    handleCopy,
  };
}
