"use client";

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { db } from "@/lib/firebase";
import {
  aggregateChatsToUserFeed,
  chatActivityMs,
  mergeModerationFeed,
} from "@/lib/moderation/classicFeed";
import { subscribeModerationSeen } from "@/lib/moderation/markSeen";
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
          const data = snap.data() as { username?: string; nombre?: string };
          const username = String(data.username || data.nombre || "").trim();
          if (username) {
            next[uid] = username;
            resolvedUidsRef.current.add(uid);
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

  return { feed, loading, chats };
}

export function useUserModerationChats(username: string) {
  const [chats, setChats] = useState<ModerationChatRow[]>([]);
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    resolveUidForUsername(username).then((nextUid) => {
      if (!cancelled) setUid(nextUid);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!username) return;

    const merged = new Map<string, ModerationChatRow>();
    const unsubs: Array<() => void> = [];

    function attach(q: ReturnType<typeof query>) {
      const unsub = onSnapshot(q, (snap) => {
        for (const row of snap.docs) {
          merged.set(row.id, {
            id: row.id,
            ...(row.data() as Omit<ModerationChatRow, "id">),
          });
        }
        const sorted = [...merged.values()].sort(
          (a, b) => chatActivityMs(b) - chatActivityMs(a),
        );
        setChats(sorted);
        setLoading(false);
      });
      unsubs.push(unsub);
    }

    attach(
      query(collection(db, "chats"), where("targetUsername", "==", username), limit(120)),
    );
    attach(
      query(collection(db, "chats"), where("receptorUsername", "==", username), limit(120)),
    );

    if (uid) {
      for (const field of ["receptorUid", "targetUid", "initiatorUid", "anonOwnerUid"] as const) {
        attach(query(collection(db, "chats"), where(field, "==", uid), limit(80)));
      }
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [username, uid]);

  return { chats, uid, loading };
}
