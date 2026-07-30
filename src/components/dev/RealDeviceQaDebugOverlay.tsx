"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { useChatAlerts } from "@/contexts/ChatAlertsContext";
import { getChatAnonSenderId } from "@/lib/chat/anonSender";
import {
  isOwnChatSender,
  isOwnInboxLastSender,
} from "@/lib/chat/incomingChatActivity";
import {
  profileAnonSenderFromChat,
  resolveChatViewerId,
} from "@/lib/chat/inboxPeerTitle";
import { computeThreadPendingForViewer } from "@/lib/chat/threadPending";
import {
  copyRealDeviceQaDiagnostics,
  collectRealDeviceQaDiagnostics,
  installRealDeviceQaDebugCapture,
  isRealDeviceQaDebugEnabled,
  recordQaCriticalEvent,
  setQaAuthDiagnosticState,
} from "@/lib/qa/realDeviceQaDebug";
import { auth } from "@/lib/firebase";

export default function RealDeviceQaDebugOverlay() {
  const pathname = usePathname();
  const { firebaseUser, loading: authLoading } = useAuth();
  const { totalUnread, sortedChats, uid } = useChatAlerts();
  const [snap, setSnap] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const pendingVersionRef = useRef("");

  useEffect(() => {
    const on = isRealDeviceQaDebugEnabled();
    setEnabled(on);
    if (!on) return;
    installRealDeviceQaDebugCapture();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const firebaseUid = firebaseUser?.uid || uid || "";
      setQaAuthDiagnosticState({
        authCurrentUserUid: firebaseUser?.uid || null,
        authReady: !authLoading,
        authDomain: auth.app.options.authDomain || null,
        currentHost: window.location.host,
        popupAttempted: false,
        redirectAttempted: false,
      });
      const activeMatch = pathname.match(/\/chat\/([^/?#]+)/);
      const activeThreadId = activeMatch ? decodeURIComponent(activeMatch[1]) : "";
      const isListOpen = pathname === "/chats" || pathname.startsWith("/chats/");
      const isDetailOpen = Boolean(activeThreadId);
      const anonSessionId = getChatAnonSenderId();

      const rows = sortedChats.slice(0, 8).map((chat) => {
        const viewerId = resolveChatViewerId(chat, firebaseUid);
        const threadAnon = profileAnonSenderFromChat(chat);
        const pending = computeThreadPendingForViewer(
          chat,
          firebaseUid,
          activeThreadId,
        );
        const unread = pending.computedPending ? 1 : 0;
        const own = isOwnInboxLastSender(chat, viewerId, firebaseUid);
        const latestOwn = isOwnChatSender(
          String(chat.lastMessageSender || ""),
          viewerId,
          firebaseUid,
          chat,
        );
        return {
          chatId: chat.canonicalChatId || chat.id,
          threadAnon,
          viewerId,
          unread,
          rowPending: unread > 0,
          rowShouldBePending: pending.computedPending,
          ownLatest: latestOwn,
          ownInboxLast: own,
          lastMessageSender: chat.lastMessageSender || null,
          latestMessageId: pending.latestMessageId,
          latestSenderKind: pending.latestSenderKind,
          latestSenderUid: pending.latestSenderUid,
          latestSenderAnonSessionId: pending.latestSenderAnonSessionId,
          currentAnonSessionId: pending.currentAnonSessionId,
          isOwnLatestMessage: pending.isOwnLatestMessage,
          latestAt: pending.latestAt,
          readAt: pending.readAt,
          computedPending: pending.computedPending,
          pendingReason: pending.reason,
          unreadCounts: chat.unreadCounts || null,
          readBy: chat.readBy || null,
        };
      });

      const badge = totalUnread > 0;
      const chatExtras = {
        anonSessionId,
        profileUid: uid || null,
        senderRecipient: {
          firebaseUid,
          liveAnon: anonSessionId,
        },
        activeThreadId,
        isListOpen,
        isDetailOpen,
        detailOpen: isDetailOpen,
        badgeComputed: badge,
        badgeShouldShow: badge,
        totalUnread,
        rowPendingAny: rows.some((r) => r.rowPending),
        badgeDomVisible: Boolean(
          document.querySelector(
            '[data-nav-tab="chats"] [data-chat-pending-indicator="1"]',
          ),
        ),
        rowPendingDomCount: document.querySelectorAll(
          '[data-nav-chat-row] [data-chat-pending-indicator="1"]',
        ).length,
        rows,
        clearReadLastReason:
          window.sessionStorage.getItem("sayittome_qa_clear_read_reason") ||
          "unknown",
        clearReadLastThread:
          window.sessionStorage.getItem("sayittome_qa_clear_read_thread") || "",
        listMounted: isListOpen,
        detailMountedThread: activeThreadId,
        repeatUnreadMarkerVersion: rows
          .map((r) => `${r.chatId}:${r.unread}:${String(r.lastMessageSender || "")}`)
          .join("|"),
      };
      if (
        chatExtras.repeatUnreadMarkerVersion !== pendingVersionRef.current
      ) {
        pendingVersionRef.current = chatExtras.repeatUnreadMarkerVersion;
        recordQaCriticalEvent("chat", "CHAT_PENDING_RECOMPUTED", {
          totalUnread,
          badgeComputed: badge,
          rowPendingAny: chatExtras.rowPendingAny,
          activeThreadId,
          rows: rows.map((row) => ({
            chatId: row.chatId,
            latestMessageId: row.latestMessageId,
            pending: row.computedPending,
            reason: row.pendingReason,
          })),
        });
      }

      const next = collectRealDeviceQaDiagnostics(chatExtras);
      setSnap(next);
      try {
        console.info("[qaDebug:tick]", next);
      } catch {
        /* ignore */
      }
    };

    tick();
    const id = window.setInterval(tick, 1200);
    return () => window.clearInterval(id);
  }, [
    authLoading,
    enabled,
    pathname,
    sortedChats,
    totalUnread,
    uid,
    firebaseUser?.uid,
  ]);

  if (!enabled) return null;

  return (
    <div
      data-qa-debug-overlay="1"
      style={{
        position: "fixed",
        right: 8,
        top: 8,
        zIndex: 2147483000,
        maxWidth: 280,
        maxHeight: "45vh",
        overflow: "auto",
        background: "rgba(10,10,12,0.92)",
        color: "#f3f3f3",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        lineHeight: 1.35,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        pointerEvents: "auto",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>qaDebug</div>
      <div>sha: {String(snap?.buildSha || "?")}</div>
      <div>path: {String(snap?.pathname || pathname)}</div>
      <div>
        auth:{" "}
        {String(
          ((snap as { auth?: { authReady?: boolean } } | null)?.auth || {})
            .authReady,
        )}
        {" / "}
        {String(
          ((snap as { auth?: { authLastErrorCode?: string } } | null)?.auth || {})
            .authLastErrorCode || "ok",
        )}
      </div>
      <div>
        pool:{" "}
        {String(
          ((snap as { shuffle?: { shufflePoolStatus?: string } } | null)
            ?.shuffle || {}).shufflePoolStatus || "?",
        )}
        {" / "}
        {String(
          ((snap as { shuffle?: { shufflePoolCount?: number } } | null)
            ?.shuffle || {}).shufflePoolCount ?? "?",
        )}
      </div>
      <div>black: {String((snap as { blackScreenHeuristic?: boolean } | null)?.blackScreenHeuristic)}</div>
      <div>
        shuffleVis:{" "}
        {String((snap as { shuffleVisibleSelectorCount?: number } | null)?.shuffleVisibleSelectorCount)}
      </div>
      <div>
        badge:{" "}
        {String(
          ((snap as { chat?: { badgeComputed?: boolean } } | null)?.chat || {})
            .badgeComputed,
        )}
      </div>
      <div>
        anon:{" "}
        {String(
          ((snap as { chat?: { anonSessionId?: string } } | null)?.chat || {})
            .anonSessionId || "",
        ).slice(0, 22)}
      </div>
      <button
        type="button"
        data-qa-debug-copy="1"
        onClick={() => {
          void copyRealDeviceQaDiagnostics(
            (snap as { chat?: Record<string, unknown> } | null)?.chat,
          ).then((result) => {
            setCopied(result.ok);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        style={{
          marginTop: 8,
          width: "100%",
          border: "1px solid rgba(255,180,80,0.7)",
          background: "#3a2508",
          color: "#ffcc80",
          borderRadius: 6,
          padding: "6px 8px",
          cursor: "pointer",
        }}
      >
        {copied ? "Copied" : "Copy diagnostics"}
      </button>
    </div>
  );
}
