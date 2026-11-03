"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { boostCacheKey } from "@/lib/boost/boostEligibility";
import { readClientCache, writeClientCache } from "@/lib/cache/clientCache";
import { useBoostEligibility } from "@/hooks/useBoostEligibility";

export type BoostStatus = {
  ok: boolean;
  boostCreditsMinutes: number;
  activeBoostUntil: number | null;
  referralCode: string;
  referralLink: string;
  referralsQualified: number;
  referralsPending: number;
};

const CACHE_TTL_MS = 2 * 60_000;

export function useBoostStatus(enabled = true) {
  const { firebaseUser } = useAuth();
  const { canUseBoost } = useBoostEligibility();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const refreshEpochRef = useRef(0);

  const refresh = useCallback(async (force = false) => {
    const uid = firebaseUser?.uid;
    if (!uid || !canUseBoost) {
      setStatus(null);
      return null;
    }
    // Hidden keep-alive tabs must not issue requests or discard a valid
    // previously displayed status. Resume its TTL-aware refresh on entry.
    if (!enabled) return null;

    const cacheKey = boostCacheKey(uid);

    if (!force) {
      const cached = readClientCache<BoostStatus>(cacheKey, CACHE_TTL_MS);
      if (cached?.ok) {
        setStatus(cached);
        return cached;
      }
    }

    const requestEpoch = refreshEpochRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/boost?uid=${encodeURIComponent(uid)}`);
      const json = (await res.json()) as BoostStatus & { ok: boolean };
      if (!mountedRef.current || requestEpoch !== refreshEpochRef.current) return null;
      if (json.ok) {
        setStatus(json);
        writeClientCache(cacheKey, json);
        return json;
      }
      setStatus(null);
      return null;
    } catch {
      if (mountedRef.current && requestEpoch === refreshEpochRef.current) {
        setStatus(null);
      }
      return null;
    } finally {
      if (mountedRef.current && requestEpoch === refreshEpochRef.current) {
        setLoading(false);
      }
    }
  }, [canUseBoost, enabled, firebaseUser?.uid]);

  useEffect(() => {
    mountedRef.current = true;
    if (!canUseBoost) {
      setStatus(null);
    } else if (enabled) {
      void refresh();
    } else {
      setLoading(false);
    }
    return () => {
      mountedRef.current = false;
      refreshEpochRef.current += 1;
    };
  }, [canUseBoost, enabled, refresh]);

  const activate = useCallback(async (minutes: number) => {
    const uid = firebaseUser?.uid;
    if (!uid || !canUseBoost) {
      return { ok: false as const, reason: "not_authenticated" as const };
    }

    const res = await fetch("/api/boost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, minutes }),
    });
    const json = await res.json();
    if (json.ok) {
      await refresh(true);
    }
    return json;
  }, [canUseBoost, firebaseUser?.uid, refresh]);

  return { status, loading, refresh, activate, canUseBoost };
}
