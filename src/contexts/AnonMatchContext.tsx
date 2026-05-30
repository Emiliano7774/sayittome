"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import {
  bindWhipSoundUnlock,
  notifyIncomingChatMessage,
  playIncomingWhipSound,
} from "@/lib/chat/whipSound";
import {
  clearAnonDirectChatSession,
  loadAnonDirectChatSession,
  saveAnonDirectChatSession,
  type AnonDirectChatView,
} from "@/lib/anonMatch/directChatSession";
import {
  clearAnonDirectSearchSession,
  loadAnonDirectSearchSession,
  saveAnonDirectSearchSession,
} from "@/lib/anonMatch/directSearchSession";
import { ANON_MATCH_REQUEST_MS } from "@/lib/anonMatch/types";
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

function persistSearchSession(
  active: boolean,
  phase: AnonMatchConnectPhase,
  solicitudId: string,
) {
  if (!active || phase === "accepted") {
    clearAnonDirectSearchSession();
    return;
  }

  saveAnonDirectSearchSession({
    active: true,
    phase,
    solicitudId,
    savedAt: Date.now(),
  });
}

function stopSearchSessionState(input: {
  setSearchSessionActive: (value: boolean) => void;
  setPhase: (value: AnonMatchConnectPhase) => void;
  setSolicitudId: (value: string) => void;
  searchSessionActiveRef: MutableRefObject<boolean>;
}) {
  input.searchSessionActiveRef.current = false;
  input.setSearchSessionActive(false);
  input.setSolicitudId("");
  input.setPhase("idle");
  clearAnonDirectSearchSession();
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

  useEffect(() => bindWhipSoundUnlock(), []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      const savedChat = loadAnonDirectChatSession();
      if (savedChat?.openChat?.chatId) {
        try {
          const snap = await getDoc(doc(db, "chats_anonimos", savedChat.openChat.chatId));
          if (cancelled) return;

          if (snap.exists() && String(snap.data()?.estado || "") === "activo") {
            setOpenChat(savedChat.openChat);
            setChatViewState(savedChat.chatView || "minimized");
            setPhase("accepted");
            if (!cancelled) setHydrated(true);
            return;
          }

          clearAnonDirectChatSession();
        } catch {
          if (!cancelled) clearAnonDirectChatSession();
        }
      }

      const savedSearch = loadAnonDirectSearchSession();
      if (savedSearch?.active) {
        searchSessionActiveRef.current = true;
        setSearchSessionActive(true);
        setPhase(savedSearch.phase === "accepted" ? "searching" : savedSearch.phase);
        setSolicitudId(savedSearch.solicitudId || "");

        if (savedSearch.phase === "waiting" && savedSearch.solicitudId) {
          try {
            const snap = await getDoc(
              doc(db, "solicitudes_chat_anonimo", savedSearch.solicitudId),
            );
            if (cancelled) return;

            const estado = String(snap.data()?.estado || "");
            if (!snap.exists() || estado !== "pendiente") {
              setSolicitudId("");
              setPhase("searching");
            }
          } catch {
            setSolicitudId("");
            setPhase("searching");
          }
        }
      }

      if (!cancelled) setHydrated(true);
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
    if (!hydrated) return;
    persistSearchSession(searchSessionActive, phase, solicitudId);
  }, [hydrated, phase, searchSessionActive, solicitudId]);

  useEffect(() => {
    if (!hydrated || !searchSessionActiveRef.current) return;
    if (phase === "accepted" || openChat?.chatId) return;

    if (phase === "waiting" && solicitudId) return;

    if (connectInFlightRef.current) return;

    void attemptConnectRef.current?.();
  }, [hydrated, openChat?.chatId, pathname, phase, searchSessionActive, solicitudId]);

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
          const receiverQuery = query(
            collection(db, "chats_anonimos"),
            where("anonId", "==", anonId),
            where("estado", "==", "activo"),
          );
          const receiverSnap = await getDocs(receiverQuery);
          if (cancelled || !receiverSnap.empty) {
            if (!receiverSnap.empty) {
              const row = receiverSnap.docs[0];
              setOpenChat({ chatId: row.id, role: "anonimo" });
              setChatViewState("minimized");
              setPhase("accepted");
            }
            return;
          }

          const initiatorQuery = query(
            collection(db, "chats_anonimos"),
            where("solicitanteAnonId", "==", anonId),
            where("estado", "==", "activo"),
          );
          const initiatorSnap = await getDocs(initiatorQuery);
          if (cancelled || initiatorSnap.empty) return;
          const row = initiatorSnap.docs[0];
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
    stopSearchSessionState({
      setSearchSessionActive,
      setPhase,
      setSolicitudId,
      searchSessionActiveRef,
    });
    skipServerDiscoveryRef.current = false;
    const next = { chatId, role };
    setOpenChat(next);
    setChatViewState("compact");
    setPhase("accepted");
    persistOpenChat(next, "compact", "accepted");
  }, [clearRetryTimer]);

  const attemptConnect = useCallback(async () => {
    const uid = firebaseUser?.uid || "";
    const anonSessionId = getAnonSessionId();
    const canConnectAsAnon =
      !uid && Boolean(anonSessionId) && anonSessionId !== "anon_server";

    if (!uid && !canConnectAsAnon) return;
    if (!searchSessionActiveRef.current) return;
    if (connectInFlightRef.current) return;
    if (phaseRef.current === "waiting" && solicitudRef.current) return;

    connectInFlightRef.current = true;
    setPhase("searching");
    setSolicitudId("");

    try {
      const localAnonId =
        anonSessionId && anonSessionId !== "anon_server" ? anonSessionId : "";
      const res = await fetch("/api/anon-match/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          uid
            ? {
                solicitanteUid: uid,
                localAnonId,
                excludeAnonIds: localAnonId ? [localAnonId] : [],
              }
            : {
                solicitanteAnonId: anonSessionId,
                localAnonId,
                excludeAnonIds: localAnonId ? [localAnonId] : [],
              },
        ),
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
    const uid = firebaseUser?.uid || "";
    const anonSessionId = getAnonSessionId();
    const canConnectAsAnon =
      !uid && Boolean(anonSessionId) && anonSessionId !== "anon_server";

    if (!uid && !canConnectAsAnon) return;
    if (searchSessionActiveRef.current) return;

    searchSessionActiveRef.current = true;
    setSearchSessionActive(true);
    await attemptConnect();
  }, [attemptConnect, firebaseUser?.uid]);

  useEffect(() => {
    if (!solicitudId || phase !== "waiting") return;

    const ref = doc(db, "solicitudes_chat_anonimo", solicitudId);

    const handleFailure = () => {
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
        openDirectChat(chatId, firebaseUser?.uid ? "perfil" : "anonimo");
        return;
      }

      if (estado === "rechazado" || estado === "expirado" || estado === "cancelado") {
        handleFailure();
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
        const estado = String(json?.estado || "");
        const chatId = String(json?.chatId || "");

        if (estado === "aceptado" && chatId) {
          openDirectChat(chatId, firebaseUser?.uid ? "perfil" : "anonimo");
          return;
        }

        if (estado === "expirado" || estado === "rechazado" || estado === "cancelado") {
          handleFailure();
        }
      } catch {
        handleFailure();
      }
    }, ANON_MATCH_REQUEST_MS + 500);

    return () => {
      unsub();
      window.clearTimeout(expiryTimer);
    };
  }, [firebaseUser?.uid, openDirectChat, phase, scheduleRetry, solicitudId]);

  useEffect(() => {
    if (!hydrated || openChat?.chatId || skipServerDiscoveryRef.current) return;
    if (!searchSessionActive || phase !== "waiting") return;

    const uid = firebaseUser?.uid || "";
    const anonId = getAnonSessionId();
    if (!uid && (!anonId || anonId === "anon_server")) return;

    let cancelled = false;

    const chatQuery = uid
      ? query(
          collection(db, "chats_anonimos"),
          where("solicitanteUid", "==", uid),
          where("estado", "==", "activo"),
        )
      : query(
          collection(db, "chats_anonimos"),
          where("solicitanteAnonId", "==", anonId),
          where("estado", "==", "activo"),
        );

    const unsub = onSnapshot(chatQuery, (snap) => {
      if (cancelled || snap.empty) return;
      openDirectChat(snap.docs[0].id, uid ? "perfil" : "anonimo");
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseUser?.uid, hydrated, openChat?.chatId, openDirectChat, phase, searchSessionActive]);

  useEffect(() => {
    if (!incomingRequest?.solicitudId) return;

    const ref = doc(db, "solicitudes_chat_anonimo", incomingRequest.solicitudId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const estado = String(snap.data().estado || "");
      const chatId = String(snap.data().chatId || "");
      if (estado === "aceptado" && chatId) {
        openDirectChat(chatId, "anonimo");
        setIncomingRequest(null);
      }
    });

    return () => unsub();
  }, [incomingRequest?.solicitudId, openDirectChat]);

  useEffect(() => {
    if (!hydrated) return;

    const anonId = getAnonSessionId();
    if (!anonId || anonId === "anon_server") return;

    const uid = firebaseUser?.uid || "";

    const q = query(
      collection(db, "solicitudes_chat_anonimo"),
      where("anonId", "==", anonId),
    );

    const unsub = onSnapshot(q, (snap) => {
      const pending = snap.docs
        .map((item) => ({
          solicitudId: item.id,
          solicitanteUid: String(item.data().solicitanteUid || ""),
          solicitanteAnonId: String(item.data().solicitanteAnonId || ""),
          targetAnonId: String(item.data().anonId || ""),
          expiresAt: String(item.data().expiresAt || ""),
          estado: String(item.data().estado || ""),
        }))
        .filter((row) => {
          if (row.estado !== "pendiente") return false;
          if (row.solicitanteAnonId && row.solicitanteAnonId === row.targetAnonId) return false;
          if (row.solicitanteAnonId === anonId) return false;
          if (uid && row.solicitanteUid === uid) return false;
          const expiresAt = new Date(row.expiresAt);
          if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

      const next = pending[0]
        ? {
            solicitudId: pending[0].solicitudId,
            solicitanteUid: pending[0].solicitanteUid,
            expiresAt: pending[0].expiresAt,
          }
        : null;
      setIncomingRequest(next);

      if (next && !alertedRequestIds.has(next.solicitudId)) {
        alertedRequestIds.add(next.solicitudId);
        playIncomingWhipSound();
        notifyIncomingChatMessage({
          title: "Solicitud de chat",
          body: "Alguien quiere iniciar un chat anónimo con vos.",
        });
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
  }, [firebaseUser?.uid, hydrated]);

  useEffect(() => {
    if (!openChat?.chatId || openChat.closedReason) return;

    const senderId =
      openChat.role === "perfil"
        ? firebaseUser?.uid || ""
        : getAnonSessionId();

    if (!senderId) return;

    let bootstrapped = false;
    let lastMessageId: string | null = null;

    const q = query(
      collection(db, "chats_anonimos", openChat.chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(1),
    );

    const unsub = onSnapshot(q, (snap) => {
      const docSnap = snap.docs[snap.docs.length - 1];
      if (!docSnap) return;

      const from = String(docSnap.data().senderId || "");
      const isIncoming = from !== senderId;
      const messageId = docSnap.id;
      const body = String(docSnap.data().texto || docSnap.data().text || "").trim();

      if (!bootstrapped) {
        bootstrapped = true;
        lastMessageId = messageId;
        return;
      }

      if (isIncoming && messageId !== lastMessageId) {
        lastMessageId = messageId;
        playIncomingWhipSound();
        notifyIncomingChatMessage({
          title: "Chat anónimo",
          body,
        });
      }
    });

    return () => unsub();
  }, [firebaseUser?.uid, openChat?.chatId, openChat?.closedReason, openChat?.role]);

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

      const solicitudId = incomingRequest.solicitudId;

      if (!accept) {
        try {
          await fetch("/api/anon-match/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              solicitudId,
              anonId: getAnonSessionId(),
              accept: false,
            }),
          });
        } catch {
          // Ignore reject errors; incoming listener will refresh.
        }
        setIncomingRequest(null);
        return;
      }

      const openAcceptedChat = (chatId: string) => {
        openDirectChat(chatId, "anonimo");
        setIncomingRequest(null);
      };

      const readAcceptedChatId = async () => {
        const snap = await getDoc(doc(db, "solicitudes_chat_anonimo", solicitudId));
        if (!snap.exists()) return "";
        const data = snap.data();
        if (String(data.estado || "") !== "aceptado") return "";
        return String(data.chatId || "");
      };

      try {
        const res = await fetch("/api/anon-match/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solicitudId,
            anonId: getAnonSessionId(),
            accept: true,
          }),
        });
        const json = await res.json();

        if (json?.ok && json?.chatId) {
          openAcceptedChat(String(json.chatId));
          return;
        }

        const chatId = await readAcceptedChatId();
        if (chatId) {
          openAcceptedChat(chatId);
          return;
        }
      } catch {
        try {
          const chatId = await readAcceptedChatId();
          if (chatId) {
            openAcceptedChat(chatId);
            return;
          }
        } catch {
          // Keep modal open so the user can retry.
        }
      }
    },
    [incomingRequest, openDirectChat],
  );

  const minimizeChat = useCallback(() => setChatView("minimized"), [setChatView]);
  const restoreChat = useCallback(() => setChatView("compact"), [setChatView]);
  const expandChat = useCallback(() => setChatView("expanded"), [setChatView]);

  const closeChatWindow = useCallback(() => {
    clearRetryTimer();
    stopSearchSessionState({
      setSearchSessionActive,
      setPhase,
      setSolicitudId,
      searchSessionActiveRef,
    });
    skipServerDiscoveryRef.current = true;
    setOpenChat(null);
    setChatViewState("compact");
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
