"use client";

import { Flag, Maximize2, Minimize2, Minus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  collection,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import { getVisitorId } from "@/lib/abuse/fingerprint";
import { persistAnonDirectMessage } from "@/lib/anonMatch/persistDirectMessage";
import { db } from "@/lib/firebase";

type ChatMessage = {
  id: string;
  text: string;
  mine: boolean;
};

function ChatPanel({
  messages,
  notice,
  closed,
  text,
  sending,
  onTextChange,
  onSend,
  bottomRef,
  expanded,
  modern,
}: {
  messages: ChatMessage[];
  notice: string;
  closed: boolean;
  text: string;
  sending: boolean;
  onTextChange: (value: string) => void;
  onSend: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  expanded: boolean;
  modern: boolean;
}) {
  const t = useT();

  return (
    <>
      <div
        className={`overflow-y-auto px-4 py-4 ${expanded ? "min-h-0 flex-1" : "max-h-[44vh]"}`}
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm font-bold text-white/35">{t("anon_match_chat_empty")}</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`mb-2 flex ${message.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm font-bold ${
                  message.mine
                    ? modern
                      ? "bg-violet-600 text-white"
                      : "bg-[#8C84FF] text-black"
                    : "bg-white/10 text-white"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {notice ? (
        <div className="border-t border-white/10 px-4 py-3 text-center text-sm font-bold text-white/55">
          {notice}
        </div>
      ) : null}

      {!closed ? (
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
          <input
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSend();
            }}
            placeholder={t("anon_match_chat_placeholder")}
            className="min-w-0 flex-1 rounded-2xl bg-white/5 px-4 py-3 text-sm font-bold outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={sending || !text.trim()}
            onClick={onSend}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl disabled:opacity-40 ${
              modern ? "bg-violet-600 text-white" : "bg-[#8C84FF] text-black"
            }`}
          >
            <Send size={18} />
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function AnonDirectChatWindow() {
  const match = useAnonMatchOptional();
  const { firebaseUser } = useAuth();
  const { uxMode } = useUxMode();
  const t = useT();
  const modern = uxMode === "modern";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [reportConfirmOpen, setReportConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const openChat = match?.openChat;
  const chatId = openChat?.chatId || "";
  const role = openChat?.role || "anonimo";
  const chatView = match?.chatView || "compact";

  const senderId =
    role === "perfil" ? firebaseUser?.uid || "" : getAnonSessionId();
  const senderTipo = role === "perfil" ? "perfil" : "anonimo";

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats_anonimos", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(80),
    );

    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((item) => {
        const data = item.data();
        const from = String(data.senderId || "");
        return {
          id: item.id,
          text: String(data.texto || data.text || ""),
          mine: from === senderId,
        };
      });
      setMessages(next);
    });

    return () => unsub();
  }, [chatId, senderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatView]);

  useEffect(() => {
    if (!openChat?.closedReason) {
      setNotice("");
      return;
    }

    if (openChat.closedReason === "denunciado") {
      setNotice(t("anon_match_chat_reported_closed"));
    } else {
      setNotice(t("anon_match_chat_peer_closed"));
    }
  }, [openChat?.closedReason, t]);

  useEffect(() => {
    if (chatView === "expanded") {
      document.body.classList.add("sayittome-chat-open");
      return () => document.body.classList.remove("sayittome-chat-open");
    }
    document.body.classList.remove("sayittome-chat-open");
    return undefined;
  }, [chatView]);

  if (!match || !openChat || !chatId) return null;

  const matchApi = match;
  const closed = Boolean(openChat.closedReason);

  async function handleSend() {
    const value = text.trim();
    if (!value || !chatId || openChat?.closedReason) return;

    setSending(true);
    try {
      await persistAnonDirectMessage({
        chatId,
        senderId,
        senderTipo,
        messageText: value,
      });
      setText("");
    } catch {
      setNotice(t("anon_match_chat_send_error"));
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    if (!chatId) return;
    try {
      await fetch("/api/anon-match/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, closedBy: senderId }),
      });
    } catch {
      // Local close anyway.
    }
    matchApi.closeChatWindow();
  }

  async function handleReport() {
    if (!chatId || reporting) return;
    setReporting(true);
    try {
      await fetch("/api/anon-match/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          reporterId: getVisitorId(),
          reporterUid: firebaseUser?.uid || "",
          detalle: "reporte chat anonimo directo",
        }),
      });
      setReportConfirmOpen(false);
      setNotice(t("anon_match_chat_reported_closed"));
    } catch {
      setNotice(t("anon_match_chat_send_error"));
    } finally {
      setReporting(false);
    }
  }

  function renderConfirmModal({
    open,
    onCancel,
    onConfirm,
    titleKey,
    bodyKey,
    confirmKey,
    cancelKey,
    confirmTone = "danger",
    busy = false,
  }: {
    open: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    titleKey:
      | "anon_match_chat_report_confirm_title"
      | "anon_match_chat_close_confirm_title";
    bodyKey:
      | "anon_match_chat_report_confirm_body"
      | "anon_match_chat_close_confirm_body";
    confirmKey:
      | "anon_match_chat_report_confirm_action"
      | "anon_match_chat_close_confirm_action";
    cancelKey:
      | "anon_match_chat_report_confirm_cancel"
      | "anon_match_chat_close_confirm_cancel";
    confirmTone?: "danger" | "neutral";
    busy?: boolean;
  }) {
    if (!open) return null;

    const confirmClass =
      confirmTone === "danger"
        ? modern
          ? "rounded-2xl bg-amber-500 px-3 py-3.5 text-sm font-black text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] disabled:opacity-50"
          : "rounded-2xl bg-amber-400 px-3 py-3.5 text-sm font-black text-black disabled:opacity-50"
        : modern
          ? "rounded-2xl bg-violet-600 px-3 py-3.5 text-sm font-black text-white shadow-[0_0_20px_rgba(124,58,237,0.35)] disabled:opacity-50"
          : "rounded-2xl border border-white/10 bg-white/10 px-3 py-3.5 text-sm font-black text-white disabled:opacity-50";

    return (
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 px-5 backdrop-blur-md">
        <div
          className={
            modern
              ? "w-full max-w-sm rounded-[28px] border border-violet-500/15 bg-[#080808] p-6 shadow-[0_0_80px_rgba(124,58,237,0.22)]"
              : "w-full max-w-sm rounded-[22px] border border-white/10 bg-[#141414] p-5"
          }
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="anon-chat-confirm-title"
        >
          <p
            id="anon-chat-confirm-title"
            className={
              modern
                ? "text-xl font-black tracking-tight text-white"
                : "text-[15px] font-semibold tracking-[-0.02em] text-white"
            }
          >
            {t(titleKey)}
          </p>
          <p
            className={
              modern
                ? "mt-3 text-sm font-bold leading-snug text-white/45"
                : "mt-3 text-[13px] font-medium leading-snug tracking-[-0.01em] text-white/52"
            }
          >
            {t(bodyKey)}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className={
                modern
                  ? "rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3.5 text-sm font-black text-white/65 disabled:opacity-50"
                  : "rounded-xl border border-white/10 px-3 py-3 text-[13px] font-semibold text-white/65 disabled:opacity-50"
              }
            >
              {t(cancelKey)}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={confirmClass}
            >
              {t(confirmKey)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div>
        <p className="text-sm font-black text-white">{t("anon_match_chat_title")}</p>
        <p className="text-xs font-bold text-white/40">{t("anon_match_chat_subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        {chatView === "expanded" ? (
          <button
            type="button"
            onClick={matchApi.restoreChat}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
            aria-label={t("anon_match_chat_compact")}
          >
            <Minimize2 size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={matchApi.expandChat}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
            aria-label={t("anon_match_chat_expand")}
          >
            <Maximize2 size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={matchApi.minimizeChat}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
          aria-label={t("anon_match_chat_minimize")}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => setReportConfirmOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-amber-300"
          aria-label={t("anon_match_chat_report")}
        >
          <Flag size={16} />
        </button>
        <button
          type="button"
          onClick={() => setCloseConfirmOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
          aria-label={t("anon_match_chat_close")}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );

  const panel = (
    <ChatPanel
      messages={messages}
      notice={notice}
      closed={closed}
      text={text}
      sending={sending}
      onTextChange={setText}
      onSend={() => void handleSend()}
      bottomRef={bottomRef}
      expanded={chatView === "expanded"}
      modern={modern}
    />
  );

  const confirmModals = (
    <>
      {renderConfirmModal({
        open: reportConfirmOpen,
        onCancel: () => setReportConfirmOpen(false),
        onConfirm: () => void handleReport(),
        titleKey: "anon_match_chat_report_confirm_title",
        bodyKey: "anon_match_chat_report_confirm_body",
        confirmKey: "anon_match_chat_report_confirm_action",
        cancelKey: "anon_match_chat_report_confirm_cancel",
        confirmTone: "danger",
        busy: reporting,
      })}
      {renderConfirmModal({
        open: closeConfirmOpen,
        onCancel: () => setCloseConfirmOpen(false),
        onConfirm: () => {
          setCloseConfirmOpen(false);
          void handleClose();
        },
        titleKey: "anon_match_chat_close_confirm_title",
        bodyKey: "anon_match_chat_close_confirm_body",
        confirmKey: "anon_match_chat_close_confirm_action",
        cancelKey: "anon_match_chat_close_confirm_cancel",
        confirmTone: "neutral",
      })}
    </>
  );

  if (chatView === "minimized") {
    return (
      <>
        <button
        type="button"
        onClick={matchApi.restoreChat}
        className={`fixed bottom-24 right-4 z-[110] flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black text-white shadow-lg ${
          modern
            ? "border border-violet-500/30 bg-[#080808] shadow-[0_0_24px_rgba(124,58,237,0.25)]"
            : "border border-[#8C84FF]/30 bg-[#171717]"
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-green-400" />
        {t("anon_match_chat_restore")}
      </button>
      {confirmModals}
      </>
    );
  }

  if (chatView === "expanded") {
    return (
      <>
      <div
        className={`fixed inset-0 z-[120] flex flex-col ${
          modern ? "bg-black" : "bg-black"
        }`}
      >
        {header}
        {panel}
        {closed ? (
          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={matchApi.closeChatWindow}
              className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/70"
            >
              {t("anon_match_chat_dismiss")}
            </button>
          </div>
        ) : null}
      </div>
      {confirmModals}
      </>
    );
  }

  return (
    <>
    <div
      className={`fixed inset-x-4 bottom-20 z-[110] mx-auto max-w-xl overflow-hidden rounded-[24px] shadow-[0_20px_80px_rgba(0,0,0,0.55)] ${
        modern
          ? "border border-violet-500/15 bg-[#080808] shadow-[0_0_60px_rgba(124,58,237,0.12)]"
          : "border border-white/10 bg-[#111]"
      }`}
    >
      {header}
      {panel}
      {closed ? (
        <div className="border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={matchApi.closeChatWindow}
            className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/70"
          >
            {t("anon_match_chat_dismiss")}
          </button>
        </div>
      ) : null}
    </div>
    {confirmModals}
    </>
  );
}
