"use client";

import { collection, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { db } from "@/lib/firebase";
import {
  mergeModerationMessagePages,
  moderationMessagePath,
  MODERATION_MESSAGE_COLLECTIONS,
  type ModerationMessageCollection,
} from "@/lib/moderation/moderationMessageCollections";
import {
  abortModerationMessageListen,
  beginModerationMessageListen,
  initialModerationMessageListenState,
  shouldAcceptModerationMessageSnapshot,
} from "@/lib/moderation/moderationMessageListen";
import {
  messagesChronological,
  type SpectatorMessage,
} from "@/lib/moderation/spectator";

function createdAtMs(value: { toMillis?: () => number } | undefined) {
  return value?.toMillis?.() ?? 0;
}

export function useSpectatorChatMessages(
  chatId: string,
  limitCount = 300,
  options?: { live?: boolean },
) {
  const live = options?.live !== false;
  const [painted, setPainted] = useState<{
    chatId: string;
    generation: number;
    rows: SpectatorMessage[];
  }>({ chatId: "", generation: 0, rows: [] });
  const [hasNewSinceLastRender, setHasNewSinceLastRender] = useState(false);
  const lastCountRef = useRef(0);
  const listenRef = useRef(initialModerationMessageListenState());
  const pagesRef = useRef<
    Array<{
      chatId: string;
      collectionName: ModerationMessageCollection;
      rows: Array<{
        id: string;
        createdAtMs?: number;
        text?: string;
        type?: string;
        reply?: string;
        raw: SpectatorMessage;
      }>;
    }>
  >([]);

  useEffect(() => {
    listenRef.current = beginModerationMessageListen(listenRef.current, chatId);
    const generation = listenRef.current.generation;
    pagesRef.current = [];
    lastCountRef.current = 0;

    if (!chatId) {
      listenRef.current = abortModerationMessageListen(listenRef.current);
      return;
    }

    const unsubs: Array<() => void> = [];

    const publish = (collectionName: ModerationMessageCollection, rows: SpectatorMessage[]) => {
      if (
        !shouldAcceptModerationMessageSnapshot({
          state: listenRef.current,
          snapshotGeneration: generation,
          snapshotChatId: chatId,
          collectionName,
        })
      ) {
        return;
      }
      pagesRef.current = [
        ...pagesRef.current.filter((page) => page.collectionName !== collectionName),
        {
          chatId,
          collectionName,
          rows: rows.map((row) => ({
            id: row.id,
            createdAtMs: createdAtMs(row.createdAt),
            text: row.text || row.texto,
            type: row.type,
            reply: row.reply,
            raw: {
              ...row,
              collectionName,
              collectionPath: moderationMessagePath(chatId, collectionName, row.id),
            },
          })),
        },
      ];
      const merged = mergeModerationMessagePages(
        pagesRef.current.map((page) => ({
          chatId: page.chatId,
          collectionName: page.collectionName,
          rows: page.rows,
        })),
        limitCount,
      );
      const byPath = new Map(
        pagesRef.current.flatMap((page) =>
          page.rows.map((row) => [row.raw.collectionPath || row.id, row.raw] as const),
        ),
      );
      const nextRows = merged.map(
        (item) =>
          byPath.get(item.collectionPath) || {
            id: item.id,
            text: item.text,
            type: item.type,
            reply: item.reply,
            collectionName: item.collectionName,
            collectionPath: item.collectionPath,
          },
      );
      setPainted({ chatId, generation, rows: nextRows });
      setHasNewSinceLastRender(nextRows.length > lastCountRef.current);
      lastCountRef.current = nextRows.length;
    };

    for (const collectionName of MODERATION_MESSAGE_COLLECTIONS) {
      const q = query(
        collection(db, "chats", chatId, collectionName),
        orderBy("createdAt", "desc"),
        limit(limitCount),
      );

      const mapSnap = (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
        snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<SpectatorMessage, "id">),
        }));

      if (!live) {
        void getDocs(q)
          .then((snap) => {
            publish(collectionName, mapSnap(snap));
          })
          .catch(() => {
            if (
              shouldAcceptModerationMessageSnapshot({
                state: listenRef.current,
                snapshotGeneration: generation,
                snapshotChatId: chatId,
                collectionName,
              })
            ) {
              publish(collectionName, []);
            }
          });
        continue;
      }

      unsubs.push(
        onSnapshot(
          q,
          (snap) => publish(collectionName, mapSnap(snap)),
          () => publish(collectionName, []),
        ),
      );
    }

    return () => {
      listenRef.current = abortModerationMessageListen(listenRef.current);
      for (const unsub of unsubs) unsub();
    };
  }, [chatId, limitCount, live]);

  const messages = useMemo(
    () => (painted.chatId === chatId ? painted.rows : []),
    [painted, chatId],
  );
  const loading = Boolean(chatId) && painted.chatId !== chatId;
  const chronological = useMemo(
    () => messagesChronological(messages),
    [messages],
  );

  return {
    messages,
    chronological,
    loading,
    hasNewSinceLastRender,
  };
}
