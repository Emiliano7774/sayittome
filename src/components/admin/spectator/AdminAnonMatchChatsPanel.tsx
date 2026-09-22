"use client";

import { useEffect, useState } from "react";

import { auth } from "@/lib/firebase";

type AnonMatchChat = {
  id: string;
  tipo: string;
  estado: string;
  solicitanteUid: string;
  destinatarioUid: string;
  solicitanteAnonId: string;
  destinatarioAnonId: string;
  ultimoMensaje?: string;
  solicitanteLabel?: string;
  destinatarioLabel?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type AnonMatchMessage = {
  id: string;
  collectionName: string;
  text: string;
  senderId: string;
  senderTipo: string;
  type: string;
  createdAtMs: number;
};

async function adminGet(path: string) {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("unauthorized");
  const token = await user.getIdToken(true);
  const res = await fetch(path, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(String(json?.error || `http_${res.status}`));
  return json;
}

function when(ms: number) {
  if (!ms) return "sin fecha";
  return new Date(ms).toLocaleString("es-AR");
}

export default function AdminAnonMatchChatsPanel() {
  const [chats, setChats] = useState<AnonMatchChat[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<AnonMatchMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [selectedChat, setSelectedChat] = useState<AnonMatchChat | null>(null);

  async function loadChats() {
    setLoading(true);
    setError("");
    try {
      const json = await adminGet("/api/admin/anon-match-chats");
      const rows = Array.isArray(json.chats) ? json.chats : [];
      setChats(rows);
      setSelected((current) => current || String(rows[0]?.id || ""));
    } catch (e) {
      setError(String((e as Error)?.message || "load_failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      setSelectedChat(null);
      setDetailError("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    setMessages([]);
    void adminGet(`/api/admin/anon-match-chats?chatId=${encodeURIComponent(selected)}`)
      .then((json) => {
        if (cancelled) return;
        setMessages(Array.isArray(json.messages) ? json.messages : []);
        setSelectedChat(json.chat && typeof json.chat === "object" ? json.chat : null);
      })
      .catch((e) => {
        if (!cancelled) setDetailError(String((e as Error)?.message || "detail_failed"));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (loading) {
    return <p className="p-5 font-bold text-white/40">Cargando chats anónimos...</p>;
  }

  if (error && chats.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-5">
        <p className="font-bold text-red-200">Error: {error}</p>
        <button type="button" onClick={() => void loadChats()} className="rounded-full border border-white/20 px-4 py-2 font-bold">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="grid min-h-[min(76dvh,760px)] gap-4 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
      <section className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#080808] p-3">
        <div className="mb-3 px-2">
          <p className="text-sm font-black">No encontraste a nadie interesante</p>
          <p className="text-xs font-bold text-white/40">{chats.length} chats de anon-match recuperados</p>
        </div>
        <div className="space-y-2">
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => setSelected(chat.id)}
              className={[
                "w-full rounded-xl border p-3 text-left",
                selected === chat.id ? "border-violet-400/40 bg-violet-500/10" : "border-white/10 bg-white/[.02]",
              ].join(" ")}
            >
              <p className="truncate text-sm font-black">{chat.ultimoMensaje || chat.id}</p>
              <p className="mt-1 text-xs font-bold text-white/45">
                {chat.tipo || "anon-match"} · {chat.estado || "sin estado"}
              </p>
              <p className="mt-1 truncate text-[11px] text-white/30">
                {when(chat.updatedAtMs || chat.createdAtMs)}
                {chat.solicitanteAnonId || chat.destinatarioAnonId
                  ? ` · ${chat.solicitanteAnonId || "perfil"} → ${chat.destinatarioAnonId || chat.destinatarioUid || "perfil"}`
                  : ""}
              </p>
            </button>
          ))}
          {chats.length === 0 ? <p className="p-4 text-sm font-bold text-white/35">No hay chats anon-match.</p> : null}
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#080808] p-4">
        {!selected ? (
          <p className="font-bold text-white/35">Seleccioná un chat.</p>
        ) : detailError ? (
          <p className="font-bold text-red-200">No se pudo abrir el chat: {detailError}</p>
        ) : detailLoading ? (
          <p className="font-bold text-white/35">Cargando conversación...</p>
        ) : (
          <>
            <div className="mb-4 border-b border-white/10 pb-3">
              <p className="text-sm font-black">
                {selectedChat?.solicitanteLabel || "solicitante"} → {selectedChat?.destinatarioLabel || "destinatario"}
              </p>
              <p className="mt-1 text-xs font-bold text-white/40">
                {selectedChat?.estado || "sin estado"} · {selected}
              </p>
            </div>
          <div className="space-y-2">
            {messages.map((msg) => {
              const profileSide = msg.senderTipo === "perfil";
              return (
                <div
                  key={`${msg.collectionName}:${msg.id}`}
                  className={[
                    "max-w-[86%] rounded-2xl border px-3 py-2",
                    profileSide
                      ? "ml-auto border-violet-400/20 bg-violet-500/10"
                      : "mr-auto border-white/10 bg-white/5",
                  ].join(" ")}
                >
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/35">
                    {profileSide ? "perfil" : "anónimo"} · {msg.senderId || "sin id"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">
                    {msg.text || `[${msg.type || "mensaje"}]`}
                  </p>
                  <p className="mt-1 text-[10px] text-white/25">{when(msg.createdAtMs)}</p>
                </div>
              );
            })}
            {messages.length === 0 ? <p className="font-bold text-white/35">Sin mensajes.</p> : null}
          </div>
          </>
        )}
      </section>
    </div>
  );
}
