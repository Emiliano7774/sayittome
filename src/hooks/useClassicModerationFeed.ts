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
import { useEffect, useMemo, useRef, useState } from "react";

import { auth, db } from "@/lib/firebase";
import {
  aggregateChatsToUserFeed,
  chatActivityMs,
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

async function resolveUidForUsername(username: string) {
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(username)}?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const json = await res.json();
    return String(json?.profile?.uid || "");
  } catch {
    return "";
  }
}

export function useClassicModerationFeed(limitCount = 250) {
  const [profiles, setProfiles] = useState<ModerationProfileRow[]>([]);
  const [chats, setChats] = useState<ModerationChatRow[]>([]);
  const [seenByUsername, setSeenByUsername] = useState<Record<string, number>>({});
  const [uidToUsername, setUidToUsername] = useState<Record<string, string>>({});
  const [photoByUsername, setPhotoByUsername] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const resolvedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const q = query(
      collection(db, "moderation_profiles"),
      orderBy("lastModerationActivityMs", "desc"),
      limit(limitCount),
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
        setLoading(false);
      },
      () => {
        setProfiles([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [limitCount]);

  useEffect(() => {
    const q = query(
      collection(db, "chats"),
      orderBy("updatedAt", "desc"),
      limit(limitCount),
    );

    let fallbackUnsub: (() => void) | null = null;

    const applyRows = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
      const rows = snap.docs.map(
        (row) => ({ id: row.id, ...(row.data() as Omit<ModerationChatRow, "id">) }),
      );
      rows.sort((a, b) => chatActivityMs(b) - chatActivityMs(a));
      setChats(rows);
      setLoading(false);
    };

    const unsub = onSnapshot(
      q,
      applyRows,
      () => {
        const fallback = query(collection(db, "chats"), limit(limitCount));
        fallbackUnsub = onSnapshot(fallback, applyRows);
      },
    );

    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }, [limitCount]);

  useEffect(() => {
    return subscribeModerationSeen(setSeenByUsername);
  }, []);

  useEffect(() => {
    const uids = new Set<string>();
    for (const chat of chats) {
      for (const uid of [
        chat.receptorUid,
        chat.targetUid,
        chat.initiatorUid,
        chat.anonOwnerUid,
      ]) {
        if (uid && !resolvedUidsRef.current.has(uid)) uids.add(uid);
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
          if (username) {
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

  return { feed: feedWithPhotos, loading, chats };
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

    async function loadHistory() {
      setLoading(true);
      setErrorText("");
      setErrorCode("");
      try {
        let result = await fetchUserChats(true);
        // One safe retry: token refresh / transient unavailable.
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
          setErrorCode(result.error);
          setErrorText(result.message);
          setChats([]);
          setUid("");
          return;
        }
        setUid(result.uid);
        setChats(result.chats);
      } catch (error) {
        if (!cancelled) {
          const code = String((error as Error)?.message || "client_fetch_failed");
          const { adminUserChatsErrorMessage } = await import("@/lib/admin/adminUsernameParam");
          setErrorCode(code);
          setErrorText(adminUserChatsErrorMessage(code));
          setChats([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
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
