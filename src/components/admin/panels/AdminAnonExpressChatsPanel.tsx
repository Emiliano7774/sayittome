"use client";

import { useEffect, useMemo, useState } from "react";

import AdminSpectatorMessageContent from "@/components/admin/review/AdminSpectatorMessageContent";
import { useAdminApi } from "@/components/admin/AdminShell";
import { auth } from "@/lib/firebase";
import { chatBubbleShellClass } from "@/lib/chat/chatBubbleStyles";
import { type SpectatorMessage } from "@/lib/moderation/spectator";

type ExpressChat = {
  id: string;
  tipo?: string;
  estado?: string;
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  destinatarioUid?: string;
  anonId?: string;
  createdAt?: string;
  updatedAt?: string;
  ultimoMensaje?: string;
  suspicious?: boolean;
  adminDeleted?: boolean;
};

type ExpressMessage = SpectatorMessage & {
  createdAt?: string;
  createdAtMs?: number;
  senderId?: string;
  senderKind?: string;
  senderTipo?: string;
  senderUsername?: string;
};

type ChatDetail = ExpressChat & { messages: ExpressMessage[] };

function dateMs(value?: string) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string) {
  const ms = dateMs(value);
  return ms
    ? new Date(ms).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
}

function statusLabel(chat: ExpressChat) {
  if (chat.adminDeleted) return "Archivado por admin";
  const status = String(chat.estado || "").trim().toLowerCase();
  if (status === "denunciado") return "Denunciado";
  if (status === "cerrado") return "Cerrado";
  if (status === "activo") return "Activo";
  return status || "Sin estado";
}

function chatPeerLabel(chat: ExpressChat) {
  const profileUid = String(chat.destinatarioUid || chat.solicitanteUid || "").trim();
  const anon = String(chat.anonId || chat.solicitanteAnonId || "").trim();
  return profileUid ? `Perfil · ${profileUid.slice(0, 10)}` : `Anónimo · ${anon.slice(0, 10) || "sin ID"}`;
}

function isAnonMessage(message: ExpressMessage, chat: ExpressChat) {
  const kind = String(message.senderKind || "").toLowerCase();
  const senderTipo = String(message.senderTipo || "").toLowerCase();
  if (kind === "anon" || kind === "anonimo" || senderTipo === "anonimo" || senderTipo === "anon") return true;
  const sender = String(message.senderId || message.fromUid || message.senderUid || "");
  return Boolean(sender && [chat.anonId, chat.solicitanteAnonId].includes(sender));
}

export default function AdminAnonExpressChatsPanel() {
  const admin = useAdminApi();
  const [chats, setChats] = useState<ExpressChat[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchJson(path: string) {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new Error("unauthorized");
    const token = await user.getIdToken(true);
    const response = await fetch(path, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || body.ok !== true) throw new Error(String(body.error || `http_${response.status}`));
    return body;
  }

  async function loadChats() {
    setLoading(true);
    setError("");
    try {
      const rows: ExpressChat[] = [];
      const seenCursors = new Set<string>();
      let cursor = "";
      do {
        const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const body = await fetchJson(`/api/admin/anon-express-chats${suffix}`);
        const page = Array.isArray(body.chats) ? (body.chats as ExpressChat[]) : [];
        rows.push(...page);
        const nextCursor = String(body.nextCursor || "");
        if (!nextCursor) break;
        if (seenCursors.has(nextCursor)) throw new Error("pagination_loop");
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (true);
      rows.sort((a, b) => dateMs(b.updatedAt || b.createdAt) - dateMs(a.updatedAt || a.createdAt));
      setChats(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (cause) {
      setError(String((cause as Error)?.message || "No se pudo cargar Chats Express."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void fetchJson(`/api/admin/anon-express-chats?chatId=${encodeURIComponent(selectedId)}`)
      .then((body) => {
        if (!cancelled) setDetail({ ...(body.chat as ExpressChat), messages: (body.messages || []) as ExpressMessage[] });
      })
      .catch((cause) => {
        if (!cancelled) setError(String((cause as Error)?.message || "No se pudo cargar el chat."));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const visibleChats = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return chats.filter((chat) => {
      const status = statusLabel(chat).toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!needle) return true;
      return [chat.id, chat.tipo, chat.estado, chat.solicitanteUid, chat.solicitanteAnonId, chat.destinatarioUid, chat.anonId]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [chats, queryText, statusFilter]);

  async function runAction(payload: Record<string, unknown>) {
    setError("");
    try {
      const body = await admin.postAction(payload);
      if (!body?.ok) {
        setError(String(body?.error || "La acción de moderación falló."));
        return;
      }
      const action = String(payload.action || "");
      await loadChats();
      if (action === "delete_anon_chat") {
        setSelectedId("");
        setDetail(null);
        return;
      }
      if (selectedId) {
        const refreshed = await fetchJson(`/api/admin/anon-express-chats?chatId=${encodeURIComponent(selectedId)}`);
        setDetail({ ...(refreshed.chat as ExpressChat), messages: (refreshed.messages || []) as ExpressMessage[] });
      }
    } catch (cause) {
      setError(String((cause as Error)?.message || "La acción de moderación falló."));
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/8 px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200/80">Chats Express</p>
        <p className="mt-2 text-sm font-bold text-white/65">
          Revisión completa de los chats iniciados desde «¿No encontraste a nadie interesante?». Incluye participantes, estado, mensajes y multimedia.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]">
          <div className="space-y-2 border-b border-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-white/80">Conversaciones ({visibleChats.length})</p>
              <button type="button" onClick={() => void loadChats()} className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white/65">Actualizar</button>
            </div>
            <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Buscar ID, UID o alias" className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs font-bold text-white outline-none placeholder:text-white/30" />
            <div className="flex gap-1.5 overflow-x-auto">
              {["all", "activo", "denunciado", "cerrado", "archivado por admin"].map((value) => (
                <button key={value} type="button" onClick={() => setStatusFilter(value)} className={["shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black capitalize", statusFilter === value ? "border-violet-400/35 bg-violet-500/15 text-violet-100" : "border-white/10 text-white/40"].join(" ")}>{value === "all" ? "Todos" : value}</button>
              ))}
            </div>
          </div>

          <div className="max-h-[min(68vh,720px)] overflow-y-auto">
            {loading ? <p className="p-4 text-sm font-bold text-white/35">Cargando Chats Express…</p> : visibleChats.length === 0 ? <p className="p-4 text-sm font-bold text-white/35">No hay Chats Express para revisar.</p> : visibleChats.map((chat) => (
              <button key={chat.id} type="button" onClick={() => setSelectedId(chat.id)} className={["w-full border-b border-white/6 px-4 py-3 text-left", selectedId === chat.id ? "bg-violet-500/15" : "hover:bg-white/5"].join(" ")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-black text-white/85">{chatPeerLabel(chat)}</p>
                  <span className="shrink-0 text-[10px] font-bold text-white/35">{formatDate(chat.updatedAt || chat.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] font-bold text-white/40">{chat.id}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-white/35"><span>{statusLabel(chat)}</span>{chat.suspicious ? <span className="text-amber-200">· sospechoso</span> : null}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#050505]">
          {!selectedId ? <div className="flex min-h-[420px] items-center justify-center px-6 text-center"><p className="text-sm font-bold text-white/40">Seleccioná un Chat Express para leerlo completo.</p></div> : detailLoading || !detail ? <div className="flex min-h-[420px] items-center justify-center"><p className="text-sm font-bold text-white/40">Cargando chat…</p></div> : (
            <>
              <header className="border-b border-white/10 bg-[#0a0a0a] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300/75">Revisión de Chat Express</p><p className="mt-1 text-sm font-black text-white/85">{chatPeerLabel(detail)}</p><p className="mt-1 text-[11px] font-bold text-white/40">{detail.id} · {statusLabel(detail)} · creado {formatDate(detail.createdAt)}</p></div>
                  <div className="flex flex-wrap gap-2">{detail.suspicious ? <button type="button" onClick={() => void runAction({ action: "unmark_anon_chat_suspicious", chatId: detail.id })} className="rounded-lg border border-amber-400/25 px-3 py-1.5 text-[11px] font-black text-amber-100">Quitar sospechoso</button> : <button type="button" onClick={() => void runAction({ action: "mark_anon_chat_suspicious", chatId: detail.id })} className="rounded-lg border border-amber-400/25 px-3 py-1.5 text-[11px] font-black text-amber-100">Marcar sospechoso</button>}<button type="button" onClick={() => void runAction({ action: "delete_anon_chat", chatId: detail.id })} className="rounded-lg border border-red-400/25 px-3 py-1.5 text-[11px] font-black text-red-200">Archivar chat</button></div>
                </div>
                <p className="mt-3 text-[11px] font-bold text-white/35">Solicitante: {detail.solicitanteUid || detail.solicitanteAnonId || "—"} · Destinatario: {detail.destinatarioUid || detail.anonId || "—"}</p>
              </header>
              <div className="max-h-[min(68vh,720px)] space-y-3 overflow-y-auto px-3 py-4 md:px-5">
                {detail.messages.length === 0 ? <p className="text-center text-sm font-bold text-white/35">Sin mensajes en este chat.</p> : detail.messages.map((message, index) => {
                  const anonymous = isAnonMessage(message, detail);
                  return <div key={`${message.collectionName || "mensajes"}-${message.id}-${index}`} className={["flex w-full flex-col gap-1", anonymous ? "items-start" : "items-end"].join(" ")}><span className="px-1 text-[10px] font-black uppercase tracking-wide text-white/35">{anonymous ? "Visitante anónimo" : message.senderUsername || "Perfil / destinatario"} · {formatDate(message.createdAt)}</span><div className={chatBubbleShellClass(true, !anonymous)}><AdminSpectatorMessageContent chatId={detail.id} msg={message} compact /><button type="button" onClick={() => void runAction({ action: "delete_anon_message", chatId: detail.id, messageId: message.id, collectionName: message.collectionName || "mensajes" })} className="mt-1 text-[10px] font-black text-red-300/75">Borrar mensaje</button></div></div>;
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
