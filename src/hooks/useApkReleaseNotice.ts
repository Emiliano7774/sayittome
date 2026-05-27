"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  apkReleaseRemainingMs,
  isApkReleaseFresh,
  parseApkRelease,
  type ApkReleaseInfo,
} from "@/lib/app/release";

const POLL_MS = 10_000;
const COUNTDOWN_MS = 1_000;

export function useApkReleaseNotice() {
  const [release, setRelease] = useState<ApkReleaseInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const lastVersionCodeRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/app-version?ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        const parsed = parseApkRelease(json);

        if (!cancelled) {
          if (
            parsed &&
            lastVersionCodeRef.current !== null &&
            parsed.versionCode !== lastVersionCodeRef.current
          ) {
            setTick((value) => value + 1);
          }

          if (parsed) {
            lastVersionCodeRef.current = parsed.versionCode;
          }

          setRelease(parsed);
        }
      } catch {
        if (!cancelled) setRelease(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const poll = window.setInterval(load, POLL_MS);
    const expiryTimer = window.setInterval(() => setTick((value) => value + 1), COUNTDOWN_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(expiryTimer);
    };
  }, []);

  const show = useMemo(() => {
    if (!release) return false;
    void tick;
    return isApkReleaseFresh(release);
  }, [release, tick]);

  const remainingMs = useMemo(() => {
    if (!release || !show) return 0;
    void tick;
    return apkReleaseRemainingMs(release);
  }, [release, show, tick]);

  return { show, release, loaded, remainingMs };
}
