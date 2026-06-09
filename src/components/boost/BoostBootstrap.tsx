"use client";

import { useEffect, useState } from "react";

import ShuffleBoostAnnouncementModal from "@/components/boost/ShuffleBoostAnnouncementModal";
import ShuffleBoostModal from "@/components/boost/ShuffleBoostModal";
import { captureReferralCodeFromUrl } from "@/lib/boost/referralClientStorage";
import {
  hasSeenFeatureAnnouncement,
  markFeatureAnnouncementSeen,
} from "@/lib/features/featureAnnouncements";

export default function BoostBootstrap() {
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    captureReferralCodeFromUrl();
  }, []);

  useEffect(() => {
    if (hasSeenFeatureAnnouncement()) return;

    const timer = window.setTimeout(() => {
      setShowAnnouncement(true);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  function dismissAnnouncement() {
    markFeatureAnnouncementSeen();
    setShowAnnouncement(false);
  }

  return (
    <>
      {showAnnouncement ? (
        <ShuffleBoostAnnouncementModal onDismiss={dismissAnnouncement} />
      ) : null}
      <ShuffleBoostModal />
    </>
  );
}
