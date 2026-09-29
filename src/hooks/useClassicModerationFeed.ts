"use client";

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { auth, db } from "@/lib/firebase";
import {
  aggregateChatsToUserFeed,
  chatActivityMs,
  mergeChatsById,
  mergeModerationFeed,
} from "@/lib/moderation/classicFeed";
import { normalizeModerationChatRow } from "@/lib/moderation/chatHistory";
import { subscribeModerationSeen } from "@/lib/moderation/markSeen";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import { useModerationProfilePhotos } from "@/hooks/useModerationProfilePhotos";
import type {
  ModerationChatRow,
  ModerationProfileRow,
  ModerationUserFeedEntry,
} from "@/lib/moderation/types";

export function useClassicModerationFeed(recentLiveLimit = 250) {
  const [profiles, setProfiles] = useState<ModerationProfileRow[]>([]);
  const [authoritativeChats, setAuthoritativeChats] = useState<ModerationChatRow[]>([]);
  const [recentLiveChats, setRecentLiveChats] = useState<ModerationChatRow[]>([]);
  const [seenByUsername, setSeenByUsername] = useState<Record<string, number>>({});
  const [uidToUsername, setUidToUsername] = useState<Record<string, string>>({});
  const [photoByUsername, setPhotoByUsername] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [authoritativeTotal, setAuthoritativeTotal] = useState(0);
  const [authoritativeScanned, setAuthoritativeScanned] = useState(0);
  const [lastAuthoritativeAt, setLastAuthoritativeAt] = useState("");
  const resolvedUidsRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);

  const loadAuthoritative = useCallback(async (options?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const silent = options?.silent === true;
    try {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        if (!silent) {
          setErrorText("Sesión admin requerida para el feed completo.");
          setLoading(false);
        }
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/chats-feed", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      let json: Record<string, unknown> = {};
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = {};
      }
      if (!res.ok || json?.ok !== true) {
        const code = String(json?.error || `http_${res.status}`);
        if (!silent) {
          setErrorText(`No se pudo cargar el catálogo admin (${code}).`);
        }
        return;
      }
      const rows = Array.isArray(json.chats)
        ? (json.chats as Record<string, unknown>[]).map((row) =>
            normalizeModerationChatRow(row),
          )
        : [];
      setAuthoritativeChats(rows);
      setAuthoritativeTotal(Number(json.total || rows.length) || rows.length);
      setAuthoritativeScanned(Number(json.scanned || rows.length) || rows.length);
      setLastAuthoritativeAt(String(json.generatedAt || new Date().toISOString()));
      if (json.uidToUsername && typeof json.uidToUsername === "object") {
        setUidToUsername((prev) => ({
          ...prev,
          ...(json.uidToUsername as Record<string, string>),
        }));
      }
      setErrorText("");
    } catch (error) {
      if (!silent) {
        setErrorText(
          `Error de red al cargar catálogo admin: ${String((error as Error)?.message || "unknown")}`,
        );
      }
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount bootstrap of authoritative catalog (async). Intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- admin catalog hydrate on open
    void loadAuthoritative({ silent: false });
    // No periodic full-scan timer: 1164 chats × UID resolve is too expensive.
    // Refresh on focus/visibility + manual button only.
    const onFocus = () => void loadAuthoritative({ silent: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadAuthoritative({ silent: true });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadAuthoritative]);

  // Optional hint source — never required for discovery.
  useEffect(() => {
    const q = query(
      collection(db, "moderation_profiles"),
      orderBy("lastModerationActivityMs", "desc"),
      limit(Math.max(recentLiveLimit, 250)),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setProfiles(
          snap.docs.map((row) => ({
            id: row.id,
            ...(row.data() as Omit<ModerationProfileRow, "id">),
          })),
        );
      },
      () => {
        setProfiles([]);
      },
    );

    return () => unsub();
  }, [recentLiveLimit]);

  // Bounded live window merged ON TOP of authoritative snapshot (never replaces it).
  useEffect(() => {
    const q = query(
      collection(db, "chats"),
      orderBy("updatedAt", "desc"),
      limit(recentLiveLimit),
    );

    let fallbackUnsub: (() => void) | null = null;

    const applyRows = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
      const rows = snap.docs.map(
        (row) =>
          ({ id: row.id, ...(row.data() as Omit<ModerationChatRow, "id">) }) as ModerationChatRow,
      );
      rows.sort((a, b) => chatActivityMs(b) - chatActivityMs(a));
      // Accumulate by chatId for the session so a chat that falls out of the
      // top-N live window is not dropped until remount (authoritative covers
      // everything that existed at last full snapshot).
      setRecentLiveChats((prev) => mergeChatsById(prev, rows));
    };

    const unsub = onSnapshot(
      q,
      applyRows,
      () => {
        const fallback = query(collection(db, "chats"), limit(recentLiveLimit));
        fallbackUnsub = onSnapshot(fallback, applyRows);
      },
    );

    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }, [recentLiveLimit]);

  useEffect(() => {
    return subscribeModerationSeen(setSeenByUsername);
  }, []);

  const chats = useMemo(
    () => mergeChatsById(authoritativeChats, recentLiveChats),
    [authoritativeChats, recentLiveChats],
  );

  useEffect(() => {
    const uids = new Set<string>();
    for (const chat of chats) {
      for (const uid of [
        chat.receptorUid,
        chat.targetUid,
        chat.initiatorUid,
        chat.anonOwnerUid,
        ...(chat.participantes || []),
        ...(chat.participants || []),
      ]) {
        if (uid && !String(uid).startsWith("anon_") && !resolvedUidsRef.current.has(uid)) {
          uids.add(String(uid));
        }
      }
    }

    if (uids.size === 0) return;

    let cancelled = false;

    (async () => {
      const next: Record<string, string> = {};
      for (const uid of uids) {
        try {
          const snap = await getDoc(doc(db, "usuarios", uid));
          if (!snap.exists()) continue;
          const data = snap.data() as {
            username?: string;
            nombre?: string;
            fotoPrincipal?: string;
            photoURL?: string;
            photo?: string;
            fotos?: unknown;
          };
          const username = String(data.username || data.nombre || "").trim();
          if (username && !username.startsWith("anon_")) {
            next[uid] = username;
            resolvedUidsRef.current.add(uid);
            const photo = resolveProfilePhoto(data);
            if (photo) {
              setPhotoByUsername((prev) => ({
                ...prev,
                [username.toLowerCase()]: photo,
              }));
            }
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setUidToUsername((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chats]);

  const chatFeed: ModerationUserFeedEntry[] = useMemo(
    () => aggregateChatsToUserFeed(chats, seenByUsername, uidToUsername),
    [chats, seenByUsername, uidToUsername],
  );

  const feed: ModerationUserFeedEntry[] = useMemo(
    () => mergeModerationFeed(profiles, chatFeed, seenByUsername),
    [profiles, chatFeed, seenByUsername],
  );

  const photoTargets = useMemo(
    () => feed.map((entry) => ({ username: entry.username, uid: entry.uid })),
    [feed],
  );
  const fetchedPhotos = useModerationProfilePhotos(photoTargets);

  const feedWithPhotos: ModerationUserFeedEntry[] = useMemo(
    () =>
      feed.map((entry) => {
        const key = entry.username.toLowerCase();
        const photoUrl =
          entry.photoUrl ||
          photoByUsername[key] ||
          fetchedPhotos[key] ||
          undefined;
        return photoUrl ? { ...entry, photoUrl } : entry;
      }),
    [feed, photoByUsername, fetchedPhotos],
  );

  return {
    feed: feedWithPhotos,
    loading,
    errorText,
    chats,
    authoritativeTotal,
    authoritativeScanned,
    lastAuthoritativeAt,
    refreshAuthoritative: () => loadAuthoritative({ silent: false }),
  };
}

export function useUserModerationChats(username: string) {
  const [chats, setChats] = useState<ModerationChatRow[]>([]);
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!username) return;

    let cancelled = false;

    async function waitForAdminUser() {
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser;
      return await new Promise<(typeof auth)["currentUser"]>((resolve) => {
        const unsub = auth.onAuthStateChanged((user) => {
          unsub();
          resolve(user);
        });
      });
    }

    async function fetchUserChats(forceRefresh: boolean) {
      const { adminUserChatsErrorMessage } = await import("@/lib/admin/adminUsernameParam");
      const user = await waitForAdminUser();
      if (!user) {
        return {
          ok: false as const,
          status: 401,
          error: "unauthorized",
          message: adminUserChatsErrorMessage("unauthorized"),
        };
      }
      const token = await user.getIdToken(forceRefresh);
      const res = await fetch(
        `/api/admin/user-chats?username=${encodeURIComponent(username)}`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      let json: Record<string, unknown> = {};
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = {};
      }
      if (!res.ok || !json?.ok) {
        const code = String(json?.error || `http_${res.status}` || "unknown");
        return {
          ok: false as const,
          status: res.status,
          error: code,
          message: adminUserChatsErrorMessage(code),
        };
      }
      return {
        ok: true as const,
        uid: String(json.uid || ""),
        chats: Array.isArray(json.chats)
          ? json.chats.map((row: Record<string, unknown>) => normalizeModerationChatRow(row))
          : [],
      };
    }

    let inFlight = false;

    async function loadHistory(options: { silent?: boolean; forceRefresh?: boolean } = {}) {
      if (inFlight) return;
      inFlight = true;
      const silent = options.silent === true;
      if (!silent) {
        setLoading(true);
        setErrorText("");
        setErrorCode("");
      }
      try {
        let result = await fetchUserChats(options.forceRefresh === true);
        if (
          !result.ok &&
          (result.status === 401 ||
            result.status === 503 ||
            result.error === "unavailable" ||
            result.error === "admin_sdk_unavailable")
        ) {
          result = await fetchUserChats(true);
        }
        if (cancelled) return;
        if (!result.ok) {
          if (!silent) {
            setErrorCode(result.error);
            setErrorText(result.message);
            setChats([]);
            setUid("");
          }
          return;
        }
        setUid(result.uid);
        setChats(result.chats);
      } catch (error) {
        if (!cancelled && !silent) {
          const code = String((error as Error)?.message || "client_fetch_failed");
          const { adminUserChatsErrorMessage } = await import("@/lib/admin/adminUsernameParam");
          setErrorCode(code);
          setErrorText(adminUserChatsErrorMessage(code));
          setChats([]);
        }
      } finally {
        inFlight = false;
        if (!cancelled && !silent) setLoading(false);
      }
    }

    void loadHistory({ forceRefresh: true });
    const refresh = () => void loadHistory({ silent: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // User detail: keep a gentle refresh; full catalog is on chats-feed.
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [username, retryToken]);

  return {
    chats,
    uid,
    loading,
    errorText,
    errorCode,
    total: chats.length,
    retry: () => setRetryToken((value) => value + 1),
  };
}
