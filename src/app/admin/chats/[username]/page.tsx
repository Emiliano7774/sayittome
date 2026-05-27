"use client";

import Link from "next/link";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import { db } from "@/lib/firebase";
import {
  formatActivityTime,
  getConversationType,
  groupChatsByTemporal,
  isChatUnseen,
  chatActivityMs,
} from "@/lib/moderation/classicFeed";
import {
  markModerationChatSeen,
  markModerationUserSeen,
} from "@/lib/moderation/markSeen";
import { useUserModerationChats } from "@/hooks/useClassicModerationFeed";
import { usePhoneShell } from "@/hooks/usePhoneShell";
import type { ModerationChatRow } from "@/lib/moderation/types";

type MessageRow = {
  id: string;
  text?: string;
  texto?: string;
  type?: string;
};

export default function ClassicModerationUserPage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const admin = useAdminApi();
  const phoneShell = usePhoneShell();
  const username = decodeURIComponent(String(params.username || ""));

  const { chats, loading } = useUserModerationChats(username);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [mobilePane, setMobilePane] = useState<"list" | "messages">("list");

  const sections = useMemo(
    () => groupChatsByTemporal(chats, username),
    [chats, username],
  );

  const latestActivityMs = chats[0] ? chatActivityMs(chats[0]) : 0;
  const markedSeenRef = useRef(false);

  useEffect(() => {
    markedSeenRef.current = false;
  }, [username]);

  useEffect(() => {
    if (!username || !latestActivityMs || loading || markedSeenRef.current) return;
    markedSeenRef.current = true;
    void markModerationUserSeen(username, latestActivityMs);
  }, [username, latestActivityMs, loading]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }

    void markModerationChatSeen(selectedChatId);

    const q = query(
      collection(db, "chats", selectedChatId, "mensajes"),
      orderBy("createdAt", "desc"),
      limit(60),
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<MessageRow, "id">) })),
      );
    });

    return () => unsub();
  }, [selectedChatId]);

  useEffect(() => {
    if (selectedChatId || chats.length === 0) return;
    setSelectedChatId(chats[0].id);
  }, [chats, selectedChatId]);

  function openChat(chat: ModerationChatRow) {
    setSelectedChatId(chat.id);
    void markModerationChatSeen(chat.id);
    if (phoneShell) setMobilePane("messages");
  }

  const showList = !phoneShell || mobilePane === "list";
  const showMessages = !phoneShell || mobilePane === "messages";

  return (
    <AdminShell title={`Revisar · ${username}`}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/chats")}
          className="border border-white/15 bg-[#111] px-4 py-2 text-sm font-bold"
        >
          ← Volver al feed
        </button>
        <Link
          href={`/u/${encodeURIComponent(username)}`}
          className="border border-white/15 bg-[#111] px-4 py-2 text-sm font-bold"
        >
          Ver perfil público
        </Link>
      </div>

      {loading ? (
        <p className="text-lg font-bold text-white/35 md:text-2xl">Cargando historial...</p>
      ) : (
        <div className="grid gap-4 md:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          {showList ? (
          <div className="space-y-4 md:space-y-6">
            {sections.map((section) => (
              <section key={section.id} className="border border-white/10 bg-[#0d0d0d]">
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-white/45">
                    {section.label}
                  </p>
                </div>

                <div className="divide-y divide-white/8">
                  {section.chats.map((chat) => {
                    const unseen = isChatUnseen(chat);
                    const active = selectedChatId === chat.id;

                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => openChat(chat)}
                        className={[
                          "w-full px-4 py-4 text-left transition",
                          active ? "bg-[#1a1a1a]" : "bg-transparent hover:bg-[#141414]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-lg font-bold">
                              {getConversationType(chat, username)}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm font-bold text-white/55">
                              {chat.lastMessage || "Sin mensajes"}
                            </p>
                            <p className="mt-2 text-xs font-bold text-white/35">
                              {formatActivityTime(chat.updatedAt?.toMillis?.() ?? 0)}
                            </p>
                          </div>

                          {unseen ? (
                            <span className="shrink-0 border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-200">
                              No visto
                            </span>
                          ) : (
                            <span className="shrink-0 border border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-white/35">
                              Visto
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          ) : null}

          {showMessages ? (
          <div className="border border-white/10 bg-[#111] p-3 md:p-4">
            {phoneShell ? (
              <button
                type="button"
                onClick={() => setMobilePane("list")}
                className="mb-3 border border-white/15 bg-[#0d0d0d] px-3 py-2 text-xs font-bold"
              >
                ← Volver a conversaciones
              </button>
            ) : null}

            {selectedChatId ? (
              <>
                <div className="mb-4 flex flex-wrap gap-2 border-b border-white/10 pb-4">
                  <button
                    type="button"
                    onClick={() =>
                      admin.postAction({ action: "mark_chat_suspicious", chatId: selectedChatId })
                    }
                    className="border border-amber-400/30 bg-[#1a1a1a] px-3 py-2 text-xs font-bold"
                  >
                    Marcar sospechoso
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      admin.postAction({ action: "delete_chat", chatId: selectedChatId })
                    }
                    className="border border-red-400/30 bg-[#1a1a1a] px-3 py-2 text-xs font-bold"
                  >
                    Borrar hilo
                  </button>
                  <Link
                    href={`/chat/${encodeURIComponent(selectedChatId)}?u=${encodeURIComponent(username)}`}
                    className="border border-white/15 bg-[#1a1a1a] px-3 py-2 text-xs font-bold"
                  >
                    Abrir chat completo
                  </Link>
                </div>

                <div className="max-h-[58vh] space-y-2 overflow-y-auto md:max-h-[70vh]">
                  {messages.map((msg) => (
                    <div key={msg.id} className="border border-white/8 bg-[#0d0d0d] p-3">
                      <p className="font-bold text-white/80">
                        {msg.text || msg.texto || `[${msg.type || "text"}]`}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          admin.postAction({
                            action: "delete_message",
                            chatId: selectedChatId,
                            messageId: msg.id,
                          })
                        }
                        className="mt-2 text-xs font-bold text-red-300"
                      >
                        Borrar mensaje
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="font-bold text-white/40">Seleccioná una conversación.</p>
            )}
          </div>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}
