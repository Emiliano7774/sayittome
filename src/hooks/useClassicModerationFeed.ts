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

  useEffect(() => {
    if (!username) return;

    let cancelled = false;

    async function waitForAdminUser() {
      if (auth.currentUser) return auth.currentUser;
      return await new Promise<(typeof auth)["currentUser"]>((resolve) => {
        const unsub = auth.onAuthStateChanged((user) => {
          unsub();
          resolve(user);
        });
      });
    }

    async function loadHistory() {
      setLoading(true);
      setErrorText("");
      try {
        const user = await waitForAdminUser();
        if (!user) {
          if (!cancelled) {
            setErrorText("unauthorized");
            setChats([]);
            setUid("");
          }
          return;
        }
        const token = await user.getIdToken(true);
        const res = await fetch(
          `/api/admin/user-chats?username=${encodeURIComponent(username)}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const json = await res.json();

        if (cancelled) return;

        if (!json?.ok) {
          setErrorText(String(json?.error || "No se pudo cargar el historial"));
          setChats([]);
          setUid("");
          return;
        }

        setUid(String(json.uid || ""));
        setChats(
          Array.isArray(json.chats)
            ? json.chats.map((row: Record<string, unknown>) => normalizeModerationChatRow(row))
            : [],
        );
      } catch (error) {
        if (!cancelled) {
          setErrorText((error as Error)?.message || "Error cargando historial");
          setChats([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void Promise.resolve().then(() => {
      if (cancelled) return;
      void loadHistory();
    });

    return () => {
      cancelled = true;
    };
  }, [username]);

  return { chats, uid, loading, errorText, total: chats.length };
}
