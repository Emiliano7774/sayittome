"use client";

import Link from "next/link";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import { db } from "@/lib/firebase";

type ChatRow = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  lastMessage?: string;
  anon?: boolean;
  suspicious?: boolean;
};

type MessageRow = {
  id: string;
  text?: string;
  texto?: string;
  type?: string;
};

export default function ModernAdminChatsPanel() {
  const admin = useAdminApi();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);

  useEffect(() => {
    const q = query(collection(db, "chats"), orderBy("updatedAt", "desc"), limit(80));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((row) => ({
        id: row.id,
        ...(row.data() as Omit<ChatRow, "id">),
      }));
      rows.sort((a, b) => {
        const left = (a.targetUsername || a.receptorUsername || a.id).toLowerCase();
        const right = (b.targetUsername || b.receptorUsername || b.id).toLowerCase();
        return left.localeCompare(right, "es");
      });
      setChats(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selected) return;

    const q = query(
      collection(db, "chats", selected, "mensajes"),
      orderBy("createdAt", "desc"),
      limit(40),
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<MessageRow, "id">) })),
      );
    });

    return () => unsub();
  }, [selected]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => setSelected(chat.id)}
            className={[
              "w-full text-left rounded-2xl border p-4",
              selected === chat.id ? "border-violet-400/40 bg-violet-500/10" : "border-white/10",
            ].join(" ")}
          >
            <p className="font-black">
              {chat.targetUsername || chat.receptorUsername || chat.id}
            </p>
            <p className="text-white/50 font-bold text-sm mt-1 line-clamp-1">
              {chat.lastMessage || "sin mensajes"}
            </p>
            <p className="text-white/35 text-xs font-bold mt-2">
              {chat.anon ? "anon" : "normal"}
              {chat.suspicious ? " · sospechoso" : ""}
            </p>
          </button>
        ))}
      </div>

      <div>
        {selected ? (
          <div className="rounded-3xl border border-white/10 p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => admin.postAction({ action: "mark_chat_suspicious", chatId: selected })}
                className="rounded-xl bg-amber-500/20 px-4 py-2 font-black text-sm"
              >
                Marcar sospechoso
              </button>
              <button
                type="button"
                onClick={() => admin.postAction({ action: "delete_chat", chatId: selected })}
                className="rounded-xl bg-red-500/20 px-4 py-2 font-black text-sm"
              >
                Borrar hilo
              </button>
              <Link
                href={`/chat/${encodeURIComponent(selected)}`}
                className="rounded-xl border border-white/15 px-4 py-2 font-black text-sm"
              >
                Abrir chat
              </Link>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {messages.map((msg) => (
                <div key={msg.id} className="rounded-xl bg-white/5 p-3">
                  <p className="font-bold text-white/80">
                    {msg.text || msg.texto || `[${msg.type || "text"}]`}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      admin.postAction({
                        action: "delete_message",
                        chatId: selected,
                        messageId: msg.id,
                      })
                    }
                    className="mt-2 text-xs font-black text-red-300"
                  >
                    Borrar mensaje
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-white/40 font-black">Seleccioná un chat para auditar mensajes.</p>
        )}
      </div>
    </div>
  );
}
