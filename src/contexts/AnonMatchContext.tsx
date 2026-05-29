"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";
import {
  clearAnonDirectChatSession,
  loadAnonDirectChatSession,
  saveAnonDirectChatSession,
  type AnonDirectChatView,
} from "@/lib/anonMatch/directChatSession";
import { db } from "@/lib/firebase";
import type { AnonMatchRequestState } from "@/lib/anonMatch/types";

export type AnonMatchConnectPhase =
  | "idle"
  | "searching"
  | "waiting"
  | "accepted";

type OpenChat = {
  chatId: string;
  role: "perfil" | "anonimo";
  closedReason?: "cerrado" | "denunciado" | "peer_closed";
};

type AnonMatchContextValue = {
  phase: AnonMatchConnectPhase;
  searchSessionActive: boolean;
  solicitudId: string;
  openChat: OpenChat | null;
  chatView: AnonDirectChatView;
  incomingRequest: IncomingRequest | null;
  startSearchSession: () => Promise<void>;
  respondIncoming: (accept: boolean) => Promise<void>;
  openDirectChat: (chatId: string, role: "perfil" | "anonimo") => void;
  setChatView: (view: AnonDirectChatView) => void;
  minimizeChat: () => void;
  restoreChat: () => void;
  expandChat: () => void;
  closeChatWindow: () => void;
};

type IncomingRequest = {
  solicitudId: string;
  solicitanteUid: string;
  expiresAt: string;
};

const RETRY_DELAY_MS = 1200;

const AnonMatchContext = createContext<AnonMatchContextValue | null>(null);

const alertedRequestIds = new Set<string>();

function persistOpenChat(
  openChat: OpenChat | null,
  chatView: AnonDirectChatView,
  phase: AnonMatchConnectPhase,
) {
  if (!openChat?.chatId || phase !== "accepted") {
    clearAnonDirectChatSession();
    return;
  }

  saveAnonDirectChatSession({
    openChat,
    chatView,
    phase,
    savedAt: Date.now(),
  });
}

export function AnonMatchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { firebaseUser } = useAuth();
  const [phase, setPhase] = useState<AnonMatchConnectPhase>("idle");
  const [searchSessionActive, setSearchSessionActive] = useState(false);
  const [solicitudId, setSolicitudId] = useState("");
  const [openChat, setOpenChat] = useState<OpenChat | null>(null);
  const [chatView, setChatViewState] = useState<AnonDirectChatView>("compact");
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const phaseRef = useRef(phase);
  const solicitudRef = useRef(solicitudId);
  const excludeRef = useRef<string[]>([]);
  const searchSessionActiveRef = useRef(false);
  const attemptConnectRef = useRef<(() => Promise<void>) | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const connectInFlightRef = useRef(false);
  const skipServerDiscoveryRef = useRef(false);
  const lastPathRef = useRef(pathname);
  const openChatRef = useRef(openChat);
  const chatViewRef = useRef(chatView);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    solicitudRef.current = solicitudId;
  }, [solicitudId]);

  useEffect(() => {
    openChatRef.current = openChat;
  }, [openChat]);

  useEffect(() => {
    chatViewRef.current = chatView;
  }, [chatView]);

  const setChatView = useCallback((view: AnonDirectChatView) => {
    setChatViewState(view);
    if (openChatRef.current && phaseRef.current === "accepted") {
      persistOpenChat(openChatRef.current, view, "accepted");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      const saved = loadAnonDirectChatSession();
      if (!saved?.openChat?.chatId) {
        if (!cancelled) setHydrated(true);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "chats_anonimos", saved.openChat.chatId));
        if (cancelled) return;

        if (!snap.exists() || String(snap.data()?.estado || "") !== "activo") {
          clearAnonDirectChatSession();
          setHydrated(true);
          return;
        }

        setOpenChat(saved.openChat);
        setChatViewState(saved.chatView || "minimized");
        setPhase("accepted");
      } catch {
        if (!cancelled) clearAnonDirectChatSession();
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistOpenChat(openChat, chatView, phase);
  }, [chatView, hydrated, openChat, phase]);

  useEffect(() => {
    if (!hydrated || lastPathRef.current === pathname) return;

    if (openChat?.chatId && phase === "accepted" && !openChat.closedReason) {
      setChatViewState("minimized");
    }

    lastPathRef.current = pathname;
  }, [hydrated, openChat, pathname, phase]);

  useEffect(() => {
    if (!hydrated || openChat?.chatId || skipServerDiscoveryRef.current) return;

    const uid = firebaseUser?.uid || "";
    const anonId = getAnonSessionId();
    if (!uid && (!anonId || anonId === "anon_server")) return;

    let cancelled = false;

    async function discoverActiveChat() {
      try {
        if (uid) {
          const q = query(
            collection(db, "chats_anonimos"),
            where("solicitanteUid", "==", uid),
            where("estado", "==", "activo"),
          );
          const snap = await getDocs(q);
          if (cancelled || snap.empty) return;
          const row = snap.docs[0];
          setOpenChat({ chatId: row.id, role: "perfil" });
          setChatViewState("minimized");
          setPhase("accepted");
          return;
        }

        if (anonId && anonId !== "anon_server") {
          const q = query(
            collection(db, "chats_anonimos"),
            where("anonId", "==", anonId),
            where("estado", "==", "activo"),
          );
          const snap = await getDocs(q);
          if (cancelled || snap.empty) return;
          const row = snap.docs[0];
          setOpenChat({ chatId: row.id, role: "anonimo" });
          setChatViewState("minimized");
          setPhase("accepted");
        }
      } catch {
        // Ignore discovery errors.
      }
    }

    void discoverActiveChat();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid, hydrated, openChat?.chatId]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (!searchSessionActiveRef.current) return;

    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (searchSessionActiveRef.current) {
        void attemptConnectRef.current?.();
      }
    }, RETRY_DELAY_MS);
  }, [clearRetryTimer]);

  const openDirectChat = useCallback((chatId: string, role: "perfil" | "anonimo") => {
    clearRetryTimer();
    searchSessionActiveRef.current = false;
    skipServerDiscoveryRef.current = false;
    setSearchSessionActive(false);
    const next = { chatId, role };
    setOpenChat(next);
    setChatViewState("compact");
    setPhase("accepted");
    setSolicitudId("");
    persistOpenChat(next, "compact", "accepted");
  }, [clearRetryTimer]);

  const attemptConnect = useCallback(async () => {
    if (!firebaseUser?.uid || !searchSessionActiveRef.current) return;
    if (connectInFlightRef.current) return;
    if (phaseRef.current === "waiting" && solicitudRef.current) return;

    connectInFlightRef.current = true;
    setPhase("searching");
    setSolicitudId("");

    try {
      const res = await fetch("/api/anon-match/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solicitanteUid: firebaseUser.uid,
          excludeAnonIds: excludeRef.current,
        }),
      });
      const json = await res.json();

      if (!searchSessionActiveRef.current) return;

      if (!json?.ok) {
        scheduleRetry();
        return;
      }

      setSolicitudId(String(json.solicitudId || ""));
      setPhase("waiting");
    } catch {
      if (searchSessionActiveRef.current) {
        scheduleRetry();
      }
    } finally {
      connectInFlightRef.current = false;
    }
  }, [firebaseUser?.uid, scheduleRetry]);

  useEffect(() => {
    attemptConnectRef.current = attemptConnect;
  }, [attemptConnect]);

  const startSearchSession = useCallback(async () => {
    if (!firebaseUser?.uid) return;
    if (searchSessionActiveRef.current) return;

    searchSessionActiveRef.current = true;
    setSearchSessionActive(true);
    excludeRef.current = [];
    await attemptConnect();
  }, [attemptConnect, firebaseUser?.uid]);

  useEffect(() => {
    if (!solicitudId || phase !== "waiting") return;

    const ref = doc(db, "solicitudes_chat_anonimo", solicitudId);

    const handleFailure = (anonId?: string) => {
      if (anonId) {
        excludeRef.current = Array.from(new Set([...excludeRef.current, anonId]));
      }
      if (!searchSessionActiveRef.current) {
        setPhase("idle");
        setSolicitudId("");
        return;
      }
      setSolicitudId("");
      setPhase("searching");
      scheduleRetry();
    };

    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const estado = String(data.estado || "pendiente") as AnonMatchRequestState;
      const chatId = String(data.chatId || "");
      const anonId = String(data.anonId || "");

      if (estado === "aceptado" && chatId) {
        openDirectChat(chatId, "perfil");
        return;
      }

      if (estado === "rechazado" || estado === "expirado" || estado === "cancelado") {
        handleFailure(estado === "rechazado" ? anonId : undefined);
      }
    });

    const expiryTimer = window.setTimeout(async () => {
      if (phaseRef.current !== "waiting" || solicitudRef.current !== solicitudId) return;
      if (!searchSessionActiveRef.current) return;

      try {
        const res = await fetch("/api/anon-match/request", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ solicitudId }),
        });
        const json = await res.json();
        if (json?.estado === "expirado" || json?.estado === "rechazado") {
          handleFailure(String(json?.anonId || ""));
        }
      } catch {
        handleFailure();
      }
    }, 31_000);

    return () => {
      unsub();
      window.clearTimeout(expiryTimer);
    };
  }, [openDirectChat, phase, scheduleRetry, solicitudId]);

  useEffect(() => {
    const anonId = getAnonSessionId();
    if (!anonId || anonId === "anon_server") return;

    const q = query(
      collection(db, "solicitudes_chat_anonimo"),
      where("anonId", "==", anonId),
    );

    const unsub = onSnapshot(q, (snap) => {
      const pending = snap.docs
        .map((item) => ({
          solicitudId: item.id,
          solicitanteUid: String(item.data().solicitanteUid || ""),
          expiresAt: String(item.data().expiresAt || ""),
          estado: String(item.data().estado || ""),
        }))
        .filter((row) => row.estado === "pendiente")
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

      const next = pending[0] || null;
      setIncomingRequest(next);

      if (next && !alertedRequestIds.has(next.solicitudId)) {
        alertedRequestIds.add(next.solicitudId);
        playIncomingWhipSound();
      }

      if (!next) {
        for (const id of [...alertedRequestIds]) {
          if (!pending.some((row) => row.solicitudId === id)) {
            alertedRequestIds.delete(id);
          }
        }
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!openChat?.chatId) return;

    const ref = doc(db, "chats_anonimos", openChat.chatId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const estado = String(snap.data().estado || "activo");
      if (estado === "activo") return;

      setOpenChat((prev) =>
        prev
          ? {
              ...prev,
              closedReason: estado === "denunciado" ? "denunciado" : "peer_closed",
            }
          : prev,
      );
    });

    return () => unsub();
  }, [openChat?.chatId]);

  const respondIncoming = useCallback(
    async (accept: boolean) => {
      if (!incomingRequest) return;

      try {
        const res = await fetch("/api/anon-match/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solicitudId: incomingRequest.solicitudId,
            anonId: getAnonSessionId(),
            accept,
          }),
        });
        const json = await res.json();

        if (accept && json?.ok && json?.chatId) {
          openDirectChat(String(json.chatId), "anonimo");
        }

        setIncomingRequest(null);
      } catch {
        setIncomingRequest(null);
      }
    },
    [incomingRequest, openDirectChat],
  );

  const minimizeChat = useCallback(() => setChatView("minimized"), [setChatView]);
  const restoreChat = useCallback(() => setChatView("compact"), [setChatView]);
  const expandChat = useCallback(() => setChatView("expanded"), [setChatView]);

  const closeChatWindow = useCallback(() => {
    clearRetryTimer();
    searchSessionActiveRef.current = false;
    skipServerDiscoveryRef.current = true;
    setSearchSessionActive(false);
    excludeRef.current = [];
    setOpenChat(null);
    setChatViewState("compact");
    setSolicitudId("");
    setPhase("idle");
    clearAnonDirectChatSession();
  }, [clearRetryTimer]);

  useEffect(() => () => clearRetryTimer(), [clearRetryTimer]);

  const value = useMemo<AnonMatchContextValue>(
    () => ({
      phase,
      searchSessionActive,
      solicitudId,
      openChat,
      chatView,
      incomingRequest,
      startSearchSession,
      respondIncoming,
      openDirectChat,
      setChatView,
      minimizeChat,
      restoreChat,
      expandChat,
      closeChatWindow,
    }),
    [
      phase,
      searchSessionActive,
      solicitudId,
      openChat,
      chatView,
      incomingRequest,
      startSearchSession,
      respondIncoming,
      openDirectChat,
      setChatView,
      minimizeChat,
      restoreChat,
      expandChat,
      closeChatWindow,
    ],
  );

  return <AnonMatchContext.Provider value={value}>{children}</AnonMatchContext.Provider>;
}

export function useAnonMatch() {
  const ctx = useContext(AnonMatchContext);
  if (!ctx) {
    throw new Error("useAnonMatch must be used within AnonMatchProvider");
  }
  return ctx;
}

export function useAnonMatchOptional() {
  return useContext(AnonMatchContext);
}
