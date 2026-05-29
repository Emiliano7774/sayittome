"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { resolveMediaBlur, type MessageBlurSource, type ModerationBlurSource } from "@/lib/moderation/blur";
import { cacheNsfwScan, scanMediaUrl } from "@/lib/moderation/nsfwDetector";
import {
  grantSensitiveConsent,
  hasSensitiveConsent,
  mediaConsentKey,
  shouldShowSensitiveBlur,
} from "@/lib/moderation/sensitiveConsent";

type Options = {
  url?: string;
  mediaType?: "image" | "video";
  staticRequiresBlur?: boolean;
  profile?: ModerationBlurSource;
  story?: ModerationBlurSource;
  message?: MessageBlurSource;
  galleryContext?: boolean;
  ownerProfile?: ModerationBlurSource;
  enableRuntimeScan?: boolean;
};

export function useSensitiveMedia({
  url,
  mediaType = "image",
  staticRequiresBlur = false,
  profile,
  story,
  message,
  galleryContext,
  ownerProfile,
  enableRuntimeScan = true,
}: Options) {
  const mediaKey = url ? mediaConsentKey(url) : "";
  const [runtimeSensitive, setRuntimeSensitive] = useState(false);
  const [consentTick, setConsentTick] = useState(0);

  useEffect(() => {
    if (!enableRuntimeScan || !mediaKey || staticRequiresBlur) return;

    let cancelled = false;

    void scanMediaUrl(mediaKey, mediaType).then((result) => {
      if (cancelled) return;
      cacheNsfwScan(mediaKey, result);
      if (result.sensitive) setRuntimeSensitive(true);
    });

    return () => {
      cancelled = true;
    };
  }, [enableRuntimeScan, mediaKey, mediaType, staticRequiresBlur]);

  const requiresBlur = useMemo(
    () =>
      resolveMediaBlur({
        url: mediaKey,
        profile,
        story,
        message,
        galleryContext,
        ownerProfile,
        runtimeSensitive: staticRequiresBlur || runtimeSensitive,
      }),
    [
      mediaKey,
      profile,
      story,
      message,
      galleryContext,
      ownerProfile,
      staticRequiresBlur,
      runtimeSensitive,
    ],
  );

  const showBlur = useMemo(() => {
    void consentTick;
    if (!mediaKey) return requiresBlur;
    return shouldShowSensitiveBlur(mediaKey, requiresBlur);
  }, [consentTick, mediaKey, requiresBlur]);

  const grantReveal = useCallback(() => {
    if (!mediaKey) return;
    grantSensitiveConsent(mediaKey);
    setConsentTick((value) => value + 1);
  }, [mediaKey]);

  const hasConsent = useMemo(() => {
    void consentTick;
    return mediaKey ? hasSensitiveConsent(mediaKey) : false;
  }, [consentTick, mediaKey]);

  return {
    mediaKey,
    requiresBlur,
    showBlur,
    hasConsent,
    grantReveal,
  };
}
