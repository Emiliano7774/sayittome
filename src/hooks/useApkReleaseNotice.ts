"use client";

import { useEffect, useMemo, useState } from "react";

import {
  isApkReleaseFresh,
  parseApkRelease,
  type ApkReleaseInfo,
} from "@/lib/app/release";

export function useApkReleaseNotice() {
  const [release, setRelease] = useState<ApkReleaseInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/app-version.json?ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled) {
          setRelease(parseApkRelease(json));
        }
      } catch {
        if (!cancelled) setRelease(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const show = useMemo(() => {
    if (!release) return false;
    return isApkReleaseFresh(release);
  }, [release]);

  return { show, release, loaded };
}
