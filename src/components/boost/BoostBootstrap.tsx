"use client";

import { useEffect, useState } from "react";

import ShuffleBoostAnnouncementModal from "@/components/boost/ShuffleBoostAnnouncementModal";
import { captureReferralCodeFromUrl } from "@/lib/boost/referralClientStorage";
import {
  hasSeenFeatureAnnouncement,
  markFeatureAnnouncementSeen,
} from "@/lib/features/featureAnnouncements";
import { useBoostEligibility } from "@/hooks/useBoostEligibility";

export default function BoostBootstrap() {
  const { canUseBoost, authLoading } = useBoostEligibility();
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    captureReferralCodeFromUrl();
  }, []);

  useEffect(() => {
    if (authLoading || !canUseBoost || hasSeenFeatureAnnouncement()) return;

    const timer = window.setTimeout(() => {
      setShowAnnouncement(true);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [authLoading, canUseBoost]);

  function dismissAnnouncement() {
    markFeatureAnnouncementSeen();
    setShowAnnouncement(false);
  }

  if (!showAnnouncement) return null;

  return <ShuffleBoostAnnouncementModal onDismiss={dismissAnnouncement} />;
}
