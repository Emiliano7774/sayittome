"use client";

import { ArrowLeft, Flag, Maximize2, Minimize2, Minus, Reply, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  updateDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import AnonDirectMediaComposer from "@/components/anonMatch/AnonDirectMediaComposer";
import ChatAudioPlayer from "@/components/chat/ChatAudioPlayer";
import ChatSwipeRevealTime from "@/components/chat/ChatSwipeRevealTime";
import { chatBubbleShellClass, chatBubbleTextClass } from "@/lib/chat/chatBubbleStyles";
import FullscreenMedia from "@/components/chat/media/FullscreenMedia";
import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";
import { fetchAnonMatch, resolveAnonMatchSessionId } from "@/lib/anonMatch/fetchAnonMatch";
import { isRegisteredProfileCaller } from "@/lib/anonMatch/anonMatchConsumer";
import { getStoredAnonMatchAlias } from "@/lib/anonMatch/anonMatchSession";
import {
  pinAnonChatScroll,
  readKeyboardOverlapPx,
} from "@/lib/anonMatch/anonDirectChatScroll";
import { anonDirectIncomingNotifyBody } from "@/lib/anonMatch/anonDirectMediaLabels";
import {
  mapAnonDirectMessageDoc,
  type AnonDirectChatMessage,
} from "@/lib/anonMatch/anonDirectMessageModel";
import { getAnonDirectViewOnceCapability } from "@/lib/anonMatch/anonDirectViewOnceCapability";
import { persistAnonDirectMessage } from "@/lib/anonMatch/persistDirectMessage";
import { shouldWhipAnonDirectIncoming } from "@/lib/anonMatch/anonDirectIncomingWhip";
import { replyQuoteText } from "@/lib/chat/replyQuote";
import {
  notifyIncomingChatMessage,
  playIncomingWhipSound,
} from "@/lib/chat/whipSound";
import { auth, db } from "@/lib/firebase";
import { beginViewOnceClaim, endViewOnceClaim } from "@/lib/media/viewOnce";
import { claimViewOnceMedia } from "@/lib/media/viewOnceClaim";
import { viewOnceRemaining } from "@/lib/media/viewOncePolicy";
import { setSecureBombScreen } from "@/lib/security/secureBombScreen";

function ChatPanel({
  messages,
  notice,
  closed,
  text,
  sending,
  replyingTo,
  onTextChange,
  onSend,
  onReply,
  onClearReply,
  onMediaSent,
  onNotice,
  onOpenMedia,
  onOpenBomb,
  claimingBombId,
  chatId,
  senderId,
  senderTipo,
  listRef,
  inputRef,
  expanded,
  modern,
  pageMode = false,
}: {
  messages: AnonDirectChatMessage[];
  notice: string;
  closed: boolean;
  text: string;
  sending: boolean;
  replyingTo: AnonDirectChatMessage | null;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onReply: (message: AnonDirectChatMessage) => void;
  onClearReply: () => void;
  onMediaSent: (message: AnonDirectChatMessage) => void;
  onNotice: (notice: string) => void;
  onOpenMedia: (url: string, mediaType: "image" | "video") => void;
  onOpenBomb: (message: AnonDirectChatMessage) => void;
  claimingBombId: string | null;
  chatId: string;
  senderId: string;
  senderTipo: "perfil" | "anonimo";
  listRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  expanded: boolean;
  modern: boolean;
  pageMode?: boolean;
}) {
  const t = useT();
  const bombCap = getAnonDirectViewOnceCapability();

  return (
    <>
      <div
        ref={listRef}
        data-anon-direct-chat-scroll="1"
        className={`overflow-y-auto overscroll-contain px-4 py-4 ${expanded ? "min-h-0 flex-1" : "max-h-[44vh]"} ${pageMode ? "sayittome-chat-thread-scroller" : ""}`}
      >
        {messages.length === 0 ? (
          pageMode ? (
            <div data-chat-standard-intro="1" className="flex flex-col items-center px-5 pt-[min(10vh,5rem)]">
              <div className="flex h-40 w-40 items-center justify-center rounded-full bg-[#367a5c] text-white">
                <UserRound size={86} strokeWidth={1.6} />
              </div>
              <div className="mt-10 max-w-[312px] rounded-2xl border border-white/10 bg-[#070707] px-5 py-5 text-left text-sm text-white/90">
                <div className="text-[10px] font-bold uppercase tracking-[0.27em] text-[#9287d9]">Modo anónimo</div>
                <div className="mt-3 text-lg font-bold text-white">Estás invisible</div>
                <p className="mt-2 leading-relaxed">Hablás sin mostrar tu identidad. La otra persona no sabe quién sos; este chat vive solo en esta sesión.</p>
                <p className="mt-3 leading-relaxed">Tu mensaje le llega directamente y el chat queda disponible en Chats mientras tu sesión esté activa.</p>
              </div>
            </div>
          ) : <p className="text-center text-sm font-bold text-white/35">{t("anon_match_chat_empty")}</p>
        ) : (
          messages.map((message) => {
            if (message.status === "failed") return null;
            const bubbleClass = message.mine
              ? modern
                ? "bg-violet-600 text-white"
                : "bg-[#8C84FF] text-black"
              : "bg-white/10 text-white";
            const requiresBlur =
              message.autoModerationRequiresBlur === true ||
              message.moderationRequiresBlur === true;
            const bombExhausted =
              message.viewOnce === true &&
              (message.viewOnceExhausted === true || viewOnceRemaining(message) === 0);

            const bubble = (
                <div
                  onDoubleClick={pageMode && !closed && !message.viewOnce ? () => onReply(message) : undefined}
                  className={pageMode
                    ? chatBubbleShellClass(!modern, message.mine)
                    : `max-w-[80%] rounded-2xl px-3 py-2 text-sm font-bold ${bubbleClass}`}
                >
                  {message.reply ? (
                    <div className={pageMode
                      ? "mb-2 rounded-md bg-black/30 px-3 py-2 text-sm text-zinc-300"
                      : "mb-1 border-l-2 border-white/30 pl-2 text-[11px] font-semibold opacity-70"}>
                      {message.reply}
                    </div>
                  ) : null}

                  {message.viewOnce ? (
                    message.mine || bombExhausted || !bombCap.mayClaimViewOnce ? (
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-white/55">
                        {message.mine
                          ? "💣 Bomba enviada"
                          : bombExhausted
                            ? "Bomba abierta"
                            : "Bomba no disponible"}
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={claimingBombId === message.id}
                        onClick={() => onOpenBomb(message)}
                        className="rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-amber-100 disabled:opacity-40"
                        data-anon-direct-bomb-open="1"
                      >
                        {claimingBombId === message.id
                          ? "Abriendo…"
                          : message.type === "video"
                            ? "Ver bomba video"
                            : "Ver bomba foto"}
                      </button>
                    )
                  ) : message.type === "audio" && message.mediaUrl ? (
                    <ChatAudioPlayer
                      src={message.mediaUrl}
                      failLabel={t("chat_audio_preview_fail")}
                    />
                  ) : message.type === "image" && message.mediaUrl ? (
                    <SensitiveMediaShell
                      url={message.mediaUrl}
                      staticRequiresBlur={requiresBlur}
                      message={message}
                      enableRuntimeScan
                      className="inline-block"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenMedia(message.mediaUrl || "", "image")}
                        aria-label="Abrir imagen a pantalla completa"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.mediaUrl}
                          alt=""
                          className="max-h-[280px] rounded-xl object-cover"
                        />
                      </button>
                    </SensitiveMediaShell>
                  ) : message.type === "video" && message.mediaUrl ? (
                    <SensitiveMediaShell
                      url={message.mediaUrl}
                      mediaType="video"
                      staticRequiresBlur={requiresBlur}
                      message={message}
                      enableRuntimeScan
                      className="inline-block"
                    >
                      <button
                        type="button"
                        aria-label="Abrir video a pantalla completa"
                        onClick={() => onOpenMedia(message.mediaUrl || "", "video")}
                        className="relative block overflow-hidden rounded-xl"
                      >
                        <video
                          src={message.mediaUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="max-h-[280px] rounded-xl"
                        />
                        <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">Ampliar video</span>
                      </button>
                    </SensitiveMediaShell>
                  ) : (
                    <div className={pageMode ? chatBubbleTextClass(!modern) : undefined}>{message.text}</div>
                  )}

                  {!pageMode && !closed && !message.viewOnce ? (
                    <button
                      type="button"
                      onClick={() => onReply(message)}
                      className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-55"
                    >
                      <Reply size={10} />
                      Responder
                    </button>
                  ) : null}
                </div>
            );
            return (
              <div key={message.id} className={`mb-2 flex ${message.mine ? "justify-end" : "justify-start"}`}>
                {pageMode ? (
                  <ChatSwipeRevealTime
                    timeLabel={message.createdAtMs ? new Date(message.createdAtMs).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : ""}
                    align={message.mine ? "right" : "left"}
                    onSwipeLeftReply={!closed && !message.viewOnce ? () => onReply(message) : undefined}
                  >
                    {bubble}
                  </ChatSwipeRevealTime>
                ) : bubble}
              </div>
            );
          })
        )}
      </div>

      {notice ? (
        <div className="border-t border-white/10 px-4 py-3 text-center text-sm font-bold text-white/55">
          {notice}
        </div>
      ) : null}

      <AnonDirectMediaComposer
        closed={closed}
        modern={modern}
        chatId={chatId}
        senderId={senderId}
        senderTipo={senderTipo}
        text={text}
        sending={sending}
        replyingTo={replyingTo}
        onTextChange={onTextChange}
        onSendText={onSend}
        onClearReply={onClearReply}
        onMediaSent={onMediaSent}
        onNotice={onNotice}
        inputRef={inputRef}
      />
    </>
  );
}

export default function AnonDirectChatWindow({ pageMode = false, pageChatId }: { pageMode?: boolean; pageChatId?: string } = {}) {
  const match = useAnonMatchOptional();
  const { firebaseUser } = useAuth();
  const { uxMode } = useUxMode();
  const t = useT();
  const router = useRouter();
  const modern = uxMode === "modern";
  const [messages, setMessages] = useState<AnonDirectChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [replyingTo, setReplyingTo] = useState<AnonDirectChatMessage | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState("");
  const [fullscreenType, setFullscreenType] = useState<"image" | "video">("image");
  const [fullscreenSecureBomb, setFullscreenSecureBomb] = useState(false);
  const [claimingBombId, setClaimingBombId] = useState<string | null>(null);
  const [reportConfirmOpen, setReportConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [keyboardPx, setKeyboardPx] = useState(0);
  const sendInFlightRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const whipBootstrappedRef = useRef(false);
  const lastWhipMessageIdRef = useRef<string | null>(null);
  const secureBombObjectUrlRef = useRef("");
  const secureBombOpenRef = useRef(false);

  const openChat = pageMode && match?.openChat?.chatId !== pageChatId ? null : match?.openChat;
  const chatId = openChat?.chatId || "";
  const role = openChat?.role || "anonimo";
  const chatView = match?.chatView || "compact";

  const [anonSenderId, setAnonSenderId] = useState("");

  useEffect(() => {
    if (role === "perfil") {
      setAnonSenderId("");
      return;
    }
    void resolveAnonMatchSessionId()
      .then((id) => setAnonSenderId(id))
      .catch(() => setAnonSenderId(""));
  }, [role, chatId]);

  const senderId =
    role === "perfil" && isRegisteredProfileCaller(firebaseUser)
      ? firebaseUser?.uid || ""
      : anonSenderId;
  const senderTipo = role === "perfil" ? "perfil" : "anonimo";

  useEffect(() => {
    setText("");
    setNotice("");
    setSending(false);
    sendInFlightRef.current = false;
    setMessages([]);
    setReplyingTo(null);
    setFullscreenUrl("");
    setFullscreenSecureBomb(false);
    setClaimingBombId(null);
    secureBombOpenRef.current = false;
    setSecureBombScreen(false);
    if (secureBombObjectUrlRef.current) {
      URL.revokeObjectURL(secureBombObjectUrlRef.current);
      secureBombObjectUrlRef.current = "";
    }
    whipBootstrappedRef.current = false;
    lastWhipMessageIdRef.current = null;
  }, [chatId]);

  function revokeSecureBombObjectUrl() {
    if (!secureBombObjectUrlRef.current) return;
    URL.revokeObjectURL(secureBombObjectUrlRef.current);
    secureBombObjectUrlRef.current = "";
  }

  function leaveSecureBombMode() {
    secureBombOpenRef.current = false;
    setFullscreenSecureBomb(false);
    setSecureBombScreen(false);
    revokeSecureBombObjectUrl();
  }

  const openBombMessage = useCallback(
    async (message: AnonDirectChatMessage) => {
      if (!message.viewOnce || message.mine || !chatId) return;
      if (message.viewOnceExhausted || viewOnceRemaining(message) === 0) return;
      if (!getAnonDirectViewOnceCapability().mayClaimViewOnce) return;
      if (!beginViewOnceClaim(message.id)) return;

      setClaimingBombId(message.id);
      try {
        const claimed = await claimViewOnceMedia({ chatId, messageId: message.id });
        setMessages((old) =>
          old.map((row) =>
            row.id === message.id
              ? {
                  ...row,
                  viewOnceOpenedCount: claimed.openedCount,
                  viewOnceLimit: claimed.limit,
                  viewOnceExhausted: claimed.exhausted,
                  mediaUrl: undefined,
                }
              : row,
          ),
        );
        if (!claimed.ok) {
          setNotice(claimed.exhausted ? "Esta bomba ya se agotó" : t("chat_load_fail"));
          return;
        }
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("bomb_media_unauthenticated");

        secureBombOpenRef.current = true;
        setFullscreenSecureBomb(true);
        setSecureBombScreen(true);

        const response = await fetch("/api/view-once/media", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ chatId, messageId: message.id }),
        });
        if (!response.ok) throw new Error("bomb_media_fetch_failed");
        const mediaBlob = await response.blob();
        const objectUrl = URL.createObjectURL(mediaBlob);
        revokeSecureBombObjectUrl();
        secureBombObjectUrlRef.current = objectUrl;
        setFullscreenType(message.type === "video" ? "video" : "image");
        setFullscreenUrl(objectUrl);
      } catch {
        setFullscreenUrl("");
        leaveSecureBombMode();
        setNotice(t("chat_load_fail"));
      } finally {
        endViewOnceClaim(message.id);
        setClaimingBombId(null);
      }
    },
    [chatId, t],
  );

  const mergeOptimistic = useCallback((message: AnonDirectChatMessage) => {
    setMessages((old) => {
      if (message.status === "failed" && message.clientId) {
        return old.filter((row) => row.clientId !== message.clientId && row.id !== message.clientId);
      }
      const clientId = message.clientId || "";
      if (clientId) {
        const idx = old.findIndex(
          (row) => row.clientId === clientId || row.id === clientId,
        );
        if (idx >= 0) {
          const next = old.slice();
          next[idx] = { ...next[idx], ...message, status: message.status };
          return next;
        }
      }
      if (old.some((row) => row.id === message.id)) {
        return old.map((row) => (row.id === message.id ? { ...row, ...message } : row));
      }
      return [...old, message];
    });
  }, []);

  const handleSend = useCallback(async () => {
    const value = text.trim();
    if (!value || !chatId || openChat?.closedReason) return;
    if (sendInFlightRef.current || sending) return;

    sendInFlightRef.current = true;
    const replyText = replyQuoteText(replyingTo);
    setText("");
    setReplyingTo(null);
    setSending(true);

    try {
      await persistAnonDirectMessage({
        chatId,
        senderId,
        senderAuthUid: firebaseUser?.uid || "",
        senderTipo,
        messageText: value,
        reply: replyText || undefined,
      });
      inputRef.current?.focus();
    } catch {
      setNotice(t("anon_match_chat_send_error"));
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  }, [chatId, firebaseUser?.uid, openChat?.closedReason, replyingTo, senderId, senderTipo, sending, t, text]);

  useEffect(() => {
    if (!chatId || !senderId) return;

    const q = query(
      collection(db, "chats_anonimos", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(50),
    );

    let bootstrapped = false;
    let lastWhipId: string | null = lastWhipMessageIdRef.current;

    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((item) =>
        mapAnonDirectMessageDoc({
          id: item.id,
          data: item.data() as Record<string, unknown>,
          senderId,
        }),
      );
      setMessages((old) => {
        const optimistic = old.filter(
          (row) =>
            row.status === "sending" &&
            row.clientId &&
            !next.some(
              (server) =>
                server.id === row.clientId ||
                (server.clientId && server.clientId === row.clientId),
            ),
        );
        return [...next, ...optimistic];
      });

      const latest = snap.docs[snap.docs.length - 1];
      if (!latest) {
        bootstrapped = true;
        return;
      }

      const data = latest.data() as Record<string, unknown>;
      const from = String(data.senderId || "");
      const messageId = latest.id;
      // Mark only the viewer's own read receipt, without extra Firestore reads.
      if (from && from !== senderId && firebaseUser?.uid && chatView !== "minimized") {
        void updateDoc(doc(db, "chats_anonimos", chatId), {
          [`readBy.${firebaseUser.uid}`]: true,
          [`latestReadMessageIds.${firebaseUser.uid}`]: messageId,
          [`unreadCounts.${firebaseUser.uid}`]: 0,
        }).catch(() => undefined);
      }
      const body = anonDirectIncomingNotifyBody({
        text: String(data.texto || data.text || ""),
        type: String(data.type || "text"),
        source: String(data.source || ""),
      });
      const decision = shouldWhipAnonDirectIncoming({
        senderId,
        fromId: from,
        messageId,
        lastWhipMessageId: lastWhipId,
        bootstrapped,
      });
      bootstrapped = decision.nextBootstrapped;
      lastWhipId = decision.nextLastId;
      lastWhipMessageIdRef.current = decision.nextLastId;
      whipBootstrappedRef.current = true;

      if (!decision.whip) return;

      playIncomingWhipSound();
      notifyIncomingChatMessage({
        title: "Chat anónimo",
        body: body || "Nuevo mensaje",
      });
    });

    return () => unsub();
  }, [chatId, chatView, firebaseUser?.uid, senderId]);

  useEffect(() => {
    if (!chatId) return;
    const sync = () => {
      setKeyboardPx(readKeyboardOverlapPx());
      pinAnonChatScroll(listRef.current);
    };
    sync();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
    };
  }, [chatId, chatView]);

  useEffect(() => {
    pinAnonChatScroll(listRef.current);
    const frame = window.requestAnimationFrame(() => pinAnonChatScroll(listRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, chatView, keyboardPx, notice, replyingTo]);

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
    document.body.classList.toggle("sayittome-anon-chat-open", Boolean(openChat && chatId));
    return () => {
      document.body.classList.remove("sayittome-anon-chat-open");
    };
  }, [chatId, openChat]);

  useEffect(() => {
    if (chatView === "expanded") {
      document.body.classList.add("sayittome-chat-open");
      return () => document.body.classList.remove("sayittome-chat-open");
    }
    document.body.classList.remove("sayittome-chat-open");
    return undefined;
  }, [chatView]);

  useEffect(() => {
    if (!match || !openChat || !chatId) return;

    const onBack = () => {
      if (reportConfirmOpen) {
        setReportConfirmOpen(false);
        return;
      }
      if (closeConfirmOpen) {
        setCloseConfirmOpen(false);
        return;
      }
      if (fullscreenUrl) {
        setFullscreenUrl("");
        return;
      }
      if (chatView === "expanded") {
        match.minimizeChat();
        return;
      }
      match.closeChatWindow();
    };

    window.addEventListener("sayittome:close-anon-chat", onBack);
    return () => window.removeEventListener("sayittome:close-anon-chat", onBack);
  }, [chatView, closeConfirmOpen, chatId, fullscreenUrl, match, openChat, reportConfirmOpen]);

  if (!match || !openChat || !chatId) return null;

  const matchApi = match;
  const closed = Boolean(openChat.closedReason);

  async function handleClose() {
    if (!chatId) return;
    try {
      await fetchAnonMatch("/api/anon-match/close", {
        method: "POST",
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
      await fetchAnonMatch("/api/anon-match/report", {
        method: "POST",
        body: JSON.stringify({
          chatId,
          reporterId: senderId || getStoredAnonMatchAlias(),
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
      replyingTo={replyingTo}
      onTextChange={setText}
      onSend={() => void handleSend()}
      onReply={setReplyingTo}
      onClearReply={() => setReplyingTo(null)}
      onMediaSent={mergeOptimistic}
      onNotice={setNotice}
      onOpenMedia={(url, mediaType) => {
        leaveSecureBombMode();
        setFullscreenSecureBomb(false);
        setFullscreenType(mediaType);
        setFullscreenUrl(url);
      }}
      onOpenBomb={(message) => void openBombMessage(message)}
      claimingBombId={claimingBombId}
      chatId={chatId}
      senderId={senderId}
      senderTipo={senderTipo}
      listRef={listRef}
      inputRef={inputRef}
      expanded={pageMode || chatView === "expanded"}
      modern={modern}
      pageMode={pageMode}
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
      {fullscreenUrl ? (
        <FullscreenMedia
          url={fullscreenUrl}
          mediaType={fullscreenType}
          secure={fullscreenSecureBomb}
          onClose={() => {
            setFullscreenUrl("");
            if (fullscreenSecureBomb || secureBombOpenRef.current) leaveSecureBombMode();
          }}
        />
      ) : null}
    </>
  );

  if (pageMode) {
    return (
      <>
        <main id="sayittome-chat-page-root" data-anon-shuffle-standard-chat="1" className="sayittome-chat-shell h-dvh min-h-0 bg-black text-white">
          <section className="sayittome-chat-thread flex h-full min-h-0 flex-col bg-black" style={{ paddingBottom: keyboardPx > 0 ? keyboardPx : undefined }}>
            <header data-chat-thread-header="1" className="sayittome-chat-thread-header flex shrink-0 items-center gap-4 bg-black px-5 py-4">
              <button type="button" aria-label="Volver a Chats" onClick={() => { matchApi.closeChatWindow(); router.push("/chats"); }} className="text-white/70">
                <ArrowLeft size={27} />
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#367a5c]">
                <UserRound size={27} strokeWidth={1.8} />
              </div>
              <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">Anónimo</h1>
              <button type="button" className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/85" onClick={() => setReportConfirmOpen(true)}>
                Denunciar
              </button>
            </header>
            {panel}
          </section>
        </main>
        {confirmModals}
      </>
    );
  }

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
        className="fixed inset-0 z-[120] flex flex-col bg-black"
        style={{ paddingBottom: keyboardPx > 0 ? keyboardPx : undefined }}
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
      className={`fixed inset-x-4 z-[110] mx-auto max-w-xl overflow-hidden rounded-[24px] shadow-[0_20px_80px_rgba(0,0,0,0.55)] ${
        modern
          ? "border border-violet-500/15 bg-[#080808] shadow-[0_0_60px_rgba(124,58,237,0.12)]"
          : "border border-white/10 bg-[#111]"
      }`}
      style={{ bottom: keyboardPx > 0 ? keyboardPx + 8 : 80 }}
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
