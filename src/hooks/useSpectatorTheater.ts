"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { db } from "@/lib/firebase";
import {
  messagesChronological,
  type SpectatorMessage,
} from "@/lib/moderation/spectator";

export function useSpectatorChatMessages(chatId: string, limitCount = 300) {
  const [messages, setMessages] = useState<SpectatorMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(chatId));
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      lastCountRef.current = 0;
      return;
    }

    setLoading(true);
    lastCountRef.current = 0;

    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<SpectatorMessage, "id">),
        }));
        setMessages(rows);
        setLoading(false);
      },
      () => {
        setMessages([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [chatId, limitCount]);

  const chronological = useMemo(
    () => messagesChronological(messages),
    [messages],
  );

  const hasNewSinceLastRender = messages.length > lastCountRef.current;
  if (messages.length !== lastCountRef.current) {
    lastCountRef.current = messages.length;
  }

  return {
    messages,
    chronological,
    loading,
    hasNewSinceLastRender,
  };
}
