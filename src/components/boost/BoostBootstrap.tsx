"use client";

import { useEffect, useState } from "react";

import ShuffleBoostAnnouncementModal from "@/components/boost/ShuffleBoostAnnouncementModal";
import { useAuth } from "@/contexts/AuthContext";
import { captureReferralCodeFromUrl } from "@/lib/boost/referralClientStorage";
import {
  hasSeenFeatureAnnouncementForUser,
  persistFeatureAnnouncementSeen,
} from "@/lib/features/featureAnnouncements";
import { useBoostEligibility } from "@/hooks/useBoostEligibility";

export default function BoostBootstrap() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const { canUseBoost, authLoading } = useBoostEligibility();
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    captureReferralCodeFromUrl();
  }, []);

  useEffect(() => {
    if (authLoading || !canUseBoost || !uid) return;

    let cancelled = false;
    let timer: number | undefined;

    void (async () => {
      const seen = await hasSeenFeatureAnnouncementForUser(uid);
      if (cancelled || seen) return;

      timer = window.setTimeout(() => {
        if (cancelled) return;
        setShowAnnouncement(true);
      }, 1200);
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [authLoading, canUseBoost, uid]);

  function dismissAnnouncement() {
    if (uid) {
      void persistFeatureAnnouncementSeen(uid);
    }
    setShowAnnouncement(false);
  }

  if (!showAnnouncement) return null;

  return <ShuffleBoostAnnouncementModal onDismiss={dismissAnnouncement} />;
}
