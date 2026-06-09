"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { readClientCache, writeClientCache } from "@/lib/cache/clientCache";

export type BoostStatus = {
  ok: boolean;
  boostCreditsMinutes: number;
  activeBoostUntil: number | null;
  referralCode: string;
  referralLink: string;
  referralsQualified: number;
  referralsPending: number;
};

const CACHE_KEY = "boost_status_v1";
const CACHE_TTL_MS = 45_000;

export function useBoostStatus(enabled = true) {
  const { firebaseUser } = useAuth();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (force = false) => {
    const uid = firebaseUser?.uid;
    if (!uid || !enabled) {
      setStatus(null);
      return null;
    }

    if (!force) {
      const cached = readClientCache<BoostStatus>(CACHE_KEY, CACHE_TTL_MS);
      if (cached?.ok) {
        setStatus(cached);
        return cached;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/boost?uid=${encodeURIComponent(uid)}`);
      const json = (await res.json()) as BoostStatus & { ok: boolean };
      if (!mountedRef.current) return null;
      if (json.ok) {
        setStatus(json);
        writeClientCache(CACHE_KEY, json);
        return json;
      }
      return null;
    } catch {
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, firebaseUser?.uid]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const activate = useCallback(async () => {
    const uid = firebaseUser?.uid;
    if (!uid) return { ok: false as const, reason: "not_authenticated" };

    const res = await fetch("/api/boost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    });
    const json = await res.json();
    if (json.ok) {
      await refresh(true);
    }
    return json;
  }, [firebaseUser?.uid, refresh]);

  return { status, loading, refresh, activate };
}
