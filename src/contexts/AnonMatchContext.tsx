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
import { usePathname, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import {
  forgetDismissedRequestId,
  isDismissedRequestId,
  isRejectedSolicitanteKey,
  loadDismissedRequestIds,
  rememberDismissedRequestId,
  rememberRejectedSolicitanteKey,
  resolveSolicitanteKey,
} from "@/lib/anonMatch/dismissedIncoming";
import {
  ANON_MATCH_DOOR_EVENT,
  isAnonMatchDoorOpen,
} from "@/lib/anonMatch/anonMatchDoor";
import { fetchAnonMatch, resolveAnonMatchSessionId, resolveLiveAnonMatchCaller } from "@/lib/anonMatch/fetchAnonMatch";
import { withTimeout } from "@/lib/async/withTimeout";
import {
  buildAnonMatchCloseBody,
  buildAnonMatchRequestBody,
  buildAnonMatchRespondBody,
  resolveAcceptedChatRole,
  resolveAnonMatchCallerKind,
  resolveIncomingListenerTargets,
} from "@/lib/anonMatch/anonMatchConsumer";
import { getStoredAnonMatchAlias } from "@/lib/anonMatch/anonMatchSession";
import { readDiscoveryPayload } from "@/lib/shuffle/audiencePayload";
import {
  bindWhipSoundUnlock,
} from "@/lib/chat/whipSound";
import {
  isLocalAnonMatchDndActive,
  writeLocalAnonMatchDndUntil,
} from "@/lib/anonMatch/doNotDisturb";
import {
  clearRejectedMatchTargets,
  loadRejectedMatchTargets,
  rememberRejectedMatchTarget,
  resolveRejectedMatchTargetKey,
  splitRejectedMatchTargets,
} from "@/lib/anonMatch/rejectedMatchTargets";
import {
  loadRecentMatchTargets,
  rememberRecentMatchTarget,
} from "@/lib/anonMatch/recentMatchTargets";
import { shouldAlertIncomingAnonMatchRequest } from "@/lib/anonMatch/anonDirectIncomingWhip";
import {
  alertAnonMatchChatOpened,
  alertIncomingAnonMatchRequest,
  dismissIncomingAnonMatchRequestAlert,
} from "@/lib/anonMatch/incomingMatchAlert";
import {
  broadcastAnonDirectChatClosed,
  clearAnonDirectChatSession,
  loadAnonDirectChatSession,
  saveAnonDirectChatSession,
  subscribeAnonDirectChatClosed,
  type AnonDirectChatView,
} from "@/lib/anonMatch/directChatSession";
import {
  clearAnonDirectSearchSession,
  loadAnonDirectSearchSession,
  saveAnonDirectSearchSession,
} from "@/lib/anonMatch/directSearchSession";
import {
  bridgeAnonDirectShellsToInboxChats,
  type AnonDirectInboxChat,
} from "@/lib/anonMatch/anonDirectInboxBridge";
import {
  forgetAnonDirectInboxShell,
  loadAnonDirectInboxMemory,
  rememberAnonDirectInboxShell,
} from "@/lib/anonMatch/anonDirectInboxMemory";
import {
  parseAnonDirectInboxShell,
  type AnonDirectInboxShell,
} from "@/lib/anonMatch/anonDirectInboxShell";
import { ANON_MATCH_REQUEST_MS } from "@/lib/anonMatch/types";
import { auth, db } from "@/lib/firebase";
import type { AnonMatchRequestState } from "@/lib/anonMatch/types";

// Firestore listeners are realtime. Admin API polling is only a low-rate
// recovery path when the relevant listener is not healthy; it costs reads.
const INCOMING_POLL_MS = 30_000;
const WAITING_POLL_MS = 3_000;

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
  /** GENERAL Chats bridge rows from known chats_anonimos shells (not `chats`). */
  anonDirectInboxRows: AnonDirectInboxChat[];
  startSearchSession: () => Promise<void>;
  respondIncoming: (accept: boolean) => Promise<void>;
  /** Reject current request and pause incoming targeting for N minutes (server + local). */
  enableDoNotDisturb: (minutes: number) => Promise<boolean>;
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
  solicitanteAnonId?: string;
  destinatarioTipo: "perfil" | "anonimo";
  expiresAt: string;
};

/** Pool cache is 2m — short retry is cheap and restores historical UX. */
const RETRY_DELAY_MS = 4_000;
/** After this grace, a searcher may cancel a pending request to reach a newly entered peer. */
const WAITING_RETARGET_GRACE_MS = 5_000;
const WAITING_RETARGET_POLL_MS = 4_000;

const AnonMatchContext = createContext<AnonMatchContextValue | null>(null);

const alertedRequestIds = new Set<string>();

/** True when the recorded closer is this profile (any device) or this tab's alias. */
function closedByMe(cerradoPor: string) {
  const closer = String(cerradoPor || "").trim();
  if (!closer) return false;

  const user = auth.currentUser;
  if (user && !user.isAnonymous && closer === user.uid) return true;

  return closer === getStoredAnonMatchAlias();
}

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
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [phase, setPhase] = useState<AnonMatchConnectPhase>("idle");
  const [searchSessionActive, setSearchSessionActive] = useState(false);
  const [solicitudId, setSolicitudId] = useState("");
  const [openChat, setOpenChat] = useState<OpenChat | null>(null);
  const [chatView, setChatViewState] = useState<AnonDirectChatView>("compact");
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [matchDoorOpen, setMatchDoorOpen] = useState(false);
  const [inboxShells, setInboxShells] = useState<Record<string, AnonDirectInboxShell>>(
    {},
  );

  const phaseRef = useRef(phase);
  const solicitudRef = useRef(solicitudId);
  const searchSessionActiveRef = useRef(false);
  const attemptConnectRef = useRef<(() => Promise<void>) | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const connectInFlightRef = useRef(false);
  /** A visitor selected explicitly in Shuffle; never fall back to another user. */
  const targetAnonIdRef = useRef("");
  const shuffleDirectOpenInFlightRef = useRef(false);
  const skipServerDiscoveryRef = useRef(false);
  /** Chat dismissed here — never let a listener auto-open it (inbox reopen is explicit). */
  const lastClosedChatIdRef = useRef("");
  const lastPathRef = useRef(pathname);
  const openChatRef = useRef(openChat);
  const chatViewRef = useRef(chatView);
  const respondingIncomingRef = useRef(false);
  const watchedShellIdsRef = useRef<Set<string>>(new Set());

  const upsertInboxShell = useCallback((shell: AnonDirectInboxShell) => {
    const chatId = String(shell.chatId || "").trim();
    if (!chatId) return;
    if (shell.estado !== "activo") {
      forgetAnonDirectInboxShell(chatId);
      setInboxShells((prev) => {
        if (!(chatId in prev)) return prev;
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      return;
    }
    rememberAnonDirectInboxShell(chatId, shell.role);
    setInboxShells((prev) => {
      const existing = prev[chatId];
      if (
        existing &&
        existing.estado === shell.estado &&
        existing.ultimoMensaje === shell.ultimoMensaje &&
        existing.lastMessageSender === shell.lastMessageSender &&
        existing.latestMessageId === shell.latestMessageId &&
        existing.lastMessageAtMs === shell.lastMessageAtMs &&
        existing.updatedAtMs === shell.updatedAtMs &&
        JSON.stringify(existing.readBy || {}) === JSON.stringify(shell.readBy || {}) &&
        JSON.stringify(existing.latestReadMessageIds || {}) ===
          JSON.stringify(shell.latestReadMessageIds || {})
      ) {
        return prev;
      }
      return { ...prev, [chatId]: { ...existing, ...shell, chatId } };
    });
  }, []);
  /** Soft excludes for one connect attempt (e.g. previous waiting target when retargeting). */
  const softExcludeAnonIdsRef = useRef<string[]>([]);
  const waitingMetaRef = useRef<{
    solicitudId: string;
    targetAnonId: string;
    startedAtMs: number;
  } | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    solicitudRef.current = solicitudId;
  }, [solicitudId]);

  useEffect(() => {
    openChatRef.current = openChat;
    if (openChat?.chatId) {
      setIncomingRequest(null);
    }
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

  // GENERAL inbox: one bounded, identity-constrained listener for each member
  // side. Never scan the whole chats_anonimos collection or poll every message.
  useEffect(() => {
    const uid = String(firebaseUser?.uid || "").trim();
    if (!uid) {
      setInboxShells({});
      return;
    }
    let cancelled = false;
    const watchers = (["solicitanteAuthUid", "destinatarioAuthUid"] as const)
      .map((field) => onSnapshot(
        query(collection(db, "chats_anonimos"), where(field, "==", uid), limit(35)),
        (snapshot) => {
          if (cancelled) return;
          for (const change of snapshot.docChanges()) {
            const docSnap = change.doc;
            if (change.type === "removed") {
              // A capped query can evict an active row; retain it in session
              // memory until the authoritative shell reports a closed state.
              continue;
            }
            const data = docSnap.data();
            if (
              data.solicitanteAuthUid !== uid &&
              data.destinatarioAuthUid !== uid
            ) continue;
            const role = firebaseUser?.isAnonymous ? "anonimo" : "perfil";
            upsertInboxShell(parseAnonDirectInboxShell(docSnap.id, data, role));
          }
        },
        (error) => {
          if (!cancelled) console.warn("[anon-direct-inbox] listener", error.code);
        },
      ));
    return () => {
      cancelled = true;
      watchers.forEach((unsubscribe) => unsubscribe());
    };
  }, [firebaseUser?.uid, firebaseUser?.isAnonymous, upsertInboxShell]);

  useEffect(() => {
    const syncDoor = () => {
      setMatchDoorOpen(isAnonMatchDoorOpen(firebaseUser || auth.currentUser));
    };
    syncDoor();
    window.addEventListener(ANON_MATCH_DOOR_EVENT, syncDoor);
    return () => window.removeEventListener(ANON_MATCH_DOOR_EVENT, syncDoor);
  }, [firebaseUser?.isAnonymous, firebaseUser?.uid]);

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
    if (typeof document !== "undefined" && document.hidden) return;

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

    let cancelled = false;

    async function discoverActiveChat() {
      try {
        const live = await resolveLiveAnonMatchCaller();
        if (live.isRegisteredProfile && live.registeredUid) {
          const uid = live.registeredUid;
          const [asSolicitante, asDestinatario] = await Promise.all([
            getDocs(
              query(
                collection(db, "chats_anonimos"),
                where("solicitanteUid", "==", uid),
                where("estado", "==", "activo"),
                limit(1),
              ),
            ),
            getDocs(
              query(
                collection(db, "chats_anonimos"),
                where("destinatarioUid", "==", uid),
                where("estado", "==", "activo"),
                limit(1),
              ),
            ),
          ]);
          if (cancelled) return;
          const row = asSolicitante.docs[0] || asDestinatario.docs[0];
          if (!row) return;
          setOpenChat({ chatId: row.id, role: "perfil" });
          setChatViewState("minimized");
          setPhase("accepted");
          return;
        }

        const anonId = await resolveAnonMatchSessionId().catch(() => "");
        if (anonId) {
          const receiverQuery = query(
            collection(db, "chats_anonimos"),
            where("anonId", "==", anonId),
            where("estado", "==", "activo"),
            limit(1),
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
            limit(1),
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
  }, [firebaseUser?.isAnonymous, firebaseUser?.uid, hydrated, openChat?.chatId]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /** Drop the chat window here without telling anyone — the close already happened. */
  const dismissChatLocally = useCallback(() => {
    clearRetryTimer();
    stopSearchSessionState({
      setSearchSessionActive,
      setPhase,
      setSolicitudId,
      searchSessionActiveRef,
    });
    skipServerDiscoveryRef.current = true;
    const closedId = openChatRef.current?.chatId || "";
    lastClosedChatIdRef.current = closedId;
    // Keep shell in GENERAL inbox memory; only hide the floating window.
    if (closedId && openChatRef.current) {
      rememberAnonDirectInboxShell(closedId, openChatRef.current.role);
    }
    setOpenChat(null);
    setChatViewState("compact");
    clearAnonDirectChatSession();
    // Classic semantics: rejected targets become eligible again after chat close.
    clearRejectedMatchTargets();
  }, [clearRetryTimer]);

  const scheduleRetry = useCallback(() => {
    if (!searchSessionActiveRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (searchSessionActiveRef.current && !document.hidden) {
        void attemptConnectRef.current?.();
      }
    }, RETRY_DELAY_MS);
  }, [clearRetryTimer]);

  useEffect(() => {
    if (!searchSessionActive) return;

    const onVisibility = () => {
      if (document.hidden) {
        clearRetryTimer();
        return;
      }

      if (
        searchSessionActiveRef.current &&
        phaseRef.current === "searching" &&
        !connectInFlightRef.current
      ) {
        scheduleRetry();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearRetryTimer, scheduleRetry, searchSessionActive]);

  const openDirectChat = useCallback(async (chatId: string, role: "perfil" | "anonimo") => {
    const previous = openChatRef.current;
    // Shuffle-card DMs are persistent like registered profile chats. Switching
    // windows must never close these threads in Firestore.
    if (previous?.chatId && previous.chatId !== chatId && !previous.closedReason &&
      !previous.chatId.startsWith("asd_") && !chatId.startsWith("asd_")) {
      const live = await resolveLiveAnonMatchCaller();
      if (previous.role !== "perfil") {
        await resolveAnonMatchSessionId().catch(() => "");
      }
      const closedBy = buildAnonMatchCloseBody({
        chatId: previous.chatId,
        role: previous.role,
        registeredUid: live.registeredUid,
        serverAnonAlias: getStoredAnonMatchAlias(),
      }).closedBy;
      if (closedBy) {
        try {
          await fetchAnonMatch("/api/anon-match/close", {
            method: "POST",
            body: JSON.stringify({ chatId: previous.chatId, closedBy }),
          });
        } catch {
          // The server may have already closed the previous chat on accept.
        }
      }
    }

    clearRetryTimer();
    waitingMetaRef.current = null;
    targetAnonIdRef.current = "";
    stopSearchSessionState({
      setSearchSessionActive,
      setPhase,
      setSolicitudId,
      searchSessionActiveRef,
    });
    skipServerDiscoveryRef.current = false;
    // Explicit reopen from GENERAL inbox must defeat the local dismiss filter.
    if (lastClosedChatIdRef.current === chatId) {
      lastClosedChatIdRef.current = "";
    }
    const next = { chatId, role };
    const isNewChat = previous?.chatId !== chatId;
    rememberAnonDirectInboxShell(chatId, role);
    upsertInboxShell(
      parseAnonDirectInboxShell(chatId, { estado: "activo" }, role),
    );
    setOpenChat(next);
    setChatViewState("compact");
    setPhase("accepted");
    persistOpenChat(next, "compact", "accepted");
    // The 'Se encontró un chat' notification belongs ONLY to automatic
    // matching. Opening a normal direct Shuffle DM must never generate it.
    if (isNewChat && !chatId.startsWith("asd_")) {
      alertAnonMatchChatOpened(chatId);
    }
  }, [clearRetryTimer, upsertInboxShell]);

  const attemptConnect = useCallback(async () => {
    if (!searchSessionActiveRef.current) return;
    if (connectInFlightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (phaseRef.current === "waiting" && solicitudRef.current) return;

    const live = await resolveLiveAnonMatchCaller();
    let serverAnonAlias = "";
    if (!live.isRegisteredProfile) {
      serverAnonAlias = await resolveAnonMatchSessionId().catch(() => "");
      if (!serverAnonAlias) return;
    }

    connectInFlightRef.current = true;
    setPhase("searching");
    setSolicitudId("");

    try {
      if (!live.isRegisteredProfile) {
        await import("@/services/anonymousPresence")
          .then((mod) => mod.bumpAnonymousPresenceForMatch())
          .catch(() => "");
      }
      const localAnonId = live.isRegisteredProfile
        ? ""
        : getStoredAnonMatchAlias() || serverAnonAlias;
      const body = buildAnonMatchRequestBody({
        callerKind: live.callerKind,
        registeredUid: live.registeredUid,
        serverAnonAlias: localAnonId,
        localAnonId: live.isRegisteredProfile ? localAnonId : undefined,
      });
      const rejected = splitRejectedMatchTargets(loadRejectedMatchTargets());
      const softExclude = softExcludeAnonIdsRef.current;
      softExcludeAnonIdsRef.current = [];
      const excludeAnonIds = [
        ...((body.excludeAnonIds as string[]) || []),
        ...rejected.excludeAnonIds,
        ...softExclude,
      ];
      const excludeUids = [
        ...((body.excludeUids as string[]) || []),
        ...rejected.excludeUids,
      ];
      body.excludeAnonIds = Array.from(new Set(excludeAnonIds.filter(Boolean)));
      body.excludeUids = Array.from(new Set(excludeUids.filter(Boolean)));
      body.recentTargetIds = loadRecentMatchTargets();
      Object.assign(body, readDiscoveryPayload());
      if (targetAnonIdRef.current) {
        // A deliberate click must not accidentally pick a different visitor.
        body.targetAnonId = targetAnonIdRef.current;
        body.excludeAnonIds = ((body.excludeAnonIds as string[]) || [])
          .filter((id) => id !== targetAnonIdRef.current);
      }

      const res = await fetchAnonMatch("/api/anon-match/request", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!searchSessionActiveRef.current) return;

      if (!json?.ok) {
        waitingMetaRef.current = null;
        if (targetAnonIdRef.current) {
          targetAnonIdRef.current = "";
          stopSearchSessionState({ setSearchSessionActive, setPhase, setSolicitudId, searchSessionActiveRef });
          window.alert("Este anónimo ya no está disponible para chatear. Probá con otro perfil del Shuffle.");
        } else {
          scheduleRetry();
        }
        return;
      }

      const nextSolicitudId = String(json.solicitudId || "");
      const targetAnonId = String(json.anonId || "");
      const targetUid = String(json.destinatarioUid || "");
      // Just-contacted target goes to the back of the searcher's queue.
      rememberRecentMatchTarget(targetAnonId || targetUid);
      setSolicitudId(nextSolicitudId);
      setPhase("waiting");
      waitingMetaRef.current = {
        solicitudId: nextSolicitudId,
        targetAnonId,
        startedAtMs: Date.now(),
      };
      clearRetryTimer();
    } catch {
      if (searchSessionActiveRef.current) {
        waitingMetaRef.current = null;
        if (targetAnonIdRef.current) {
          targetAnonIdRef.current = "";
          stopSearchSessionState({ setSearchSessionActive, setPhase, setSolicitudId, searchSessionActiveRef });
          window.alert("No se pudo conectar con este anónimo. Intentá nuevamente.");
        } else {
          scheduleRetry();
        }
      }
    } finally {
      connectInFlightRef.current = false;
    }
  }, [clearRetryTimer, scheduleRetry]);

  useEffect(() => {
    attemptConnectRef.current = attemptConnect;
  }, [attemptConnect]);

  /**
   * While searching+waiting, detect newly entered anons (presence without Connect)
   * and retarget after a short grace — still respects reject list + server DND.
   */
  useEffect(() => {
    if (!hydrated || !searchSessionActive || phase !== "waiting" || !solicitudId) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const reconsider = async () => {
      if (cancelled || inFlight || targetAnonIdRef.current) return;
      if (!searchSessionActiveRef.current) return;
      if (phaseRef.current !== "waiting") return;
      if (typeof document !== "undefined" && document.hidden) return;

      const meta = waitingMetaRef.current;
      if (!meta?.solicitudId || meta.solicitudId !== solicitudRef.current) return;
      if (Date.now() - meta.startedAtMs < WAITING_RETARGET_GRACE_MS) return;

      inFlight = true;
      try {
        const live = await resolveLiveAnonMatchCaller();
        let selfAnon = "";
        if (!live.isRegisteredProfile) {
          selfAnon = getStoredAnonMatchAlias() || (await resolveAnonMatchSessionId().catch(() => ""));
        }
        const rejected = splitRejectedMatchTargets(loadRejectedMatchTargets());
        const excludeAnonIds = Array.from(
          new Set(
            [
              selfAnon,
              meta.targetAnonId,
              ...rejected.excludeAnonIds,
            ].filter(Boolean),
          ),
        );
        const excludeUids = Array.from(
          new Set([live.registeredUid, ...rejected.excludeUids].filter(Boolean)),
        );

        const qs = new URLSearchParams();
        if (excludeAnonIds.length) qs.set("exclude", excludeAnonIds.join("|"));
        if (excludeUids.length) qs.set("excludeUid", excludeUids.join("|"));
        // Anyone who heartbeated at/after we started waiting counts as "entered now".
        qs.set("seenAfterMs", String(Math.max(0, meta.startedAtMs - 1_500)));

        const res = await fetchAnonMatch(`/api/anon-match/request?${qs.toString()}`, {
          method: "GET",
        });
        const json = await res.json().catch(() => null);
        const freshestAnonId = String(json?.freshestAnonId || "").trim();
        if (!freshestAnonId || freshestAnonId === meta.targetAnonId) return;

        const cancelRes = await fetchAnonMatch("/api/anon-match/request", {
          method: "PATCH",
          body: JSON.stringify({ solicitudId: meta.solicitudId, cancel: true }),
        });
        const cancelJson = await cancelRes.json().catch(() => null);
        if (!cancelJson?.ok && String(cancelJson?.estado || "") === "aceptado") {
          return;
        }

        if (cancelled || !searchSessionActiveRef.current) return;
        if (meta.targetAnonId) {
          softExcludeAnonIdsRef.current = [meta.targetAnonId];
        }
        waitingMetaRef.current = null;
        setSolicitudId("");
        setPhase("searching");
        void attemptConnectRef.current?.();
      } catch {
        // Best-effort retarget; waiting snapshot / expiry still apply.
      } finally {
        inFlight = false;
      }
    };

    void reconsider();
    const timer = window.setInterval(() => {
      void reconsider();
    }, WAITING_RETARGET_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrated, phase, searchSessionActive, solicitudId]);

  const startSearchSession = useCallback(async () => {
    const live = await resolveLiveAnonMatchCaller();
    if (!isAnonMatchDoorOpen(live.user)) {
      if (targetAnonIdRef.current) {
        targetAnonIdRef.current = "";
        window.alert("Para hablar como anónimo, aceptá las condiciones de Shuffle.");
      }
      return;
    }
    if (!live.isRegisteredProfile) {
      const issued = await resolveAnonMatchSessionId().catch(() => "");
      if (!issued) return;
      // Publish presence immediately so the other side can pick us up.
      await import("@/services/anonymousPresence")
        .then((mod) => mod.bumpAnonymousPresenceForMatch())
        .catch(() => "");
    }
    if (searchSessionActiveRef.current) return;

    searchSessionActiveRef.current = true;
    setSearchSessionActive(true);
    await attemptConnect();
  }, [attemptConnect]);

  // Selecting an anonymous Shuffle card opens a persistent one-to-one chat
  // immediately. Only the separate random discovery uses invitations.
  useEffect(() => {
    const onTarget = (event: Event) => {
      const wanted = String(
        (event as CustomEvent<{ targetAnonId?: string }>).detail?.targetAnonId || "",
      ).trim();
      if (!/^anon_[a-z0-9_]{6,80}$/i.test(wanted)) return;
      if (shuffleDirectOpenInFlightRef.current) return;
      shuffleDirectOpenInFlightRef.current = true;

      void (async () => {
        if (searchSessionActiveRef.current) {
          // Cancel the earlier discovery before starting the explicit request.
          // An accepted chat takes priority over a new card click.
          const oldSolicitud = solicitudRef.current;
          if (oldSolicitud) {
            try {
              const response = await fetchAnonMatch("/api/anon-match/request", {
                method: "PATCH",
                body: JSON.stringify({ solicitudId: oldSolicitud, cancel: true }),
              });
              const state = await response.json().catch(() => ({}));
              if (state?.estado === "aceptado") return;
            } catch {
              window.alert("No se pudo cancelar la búsqueda anterior. Intentá de nuevo.");
              return;
            }
          } else if (connectInFlightRef.current) {
            window.alert("Ya estás iniciando una conversación. Intentá de nuevo.");
            return;
          }
          clearRetryTimer();
          searchSessionActiveRef.current = false;
          setSearchSessionActive(false);
          waitingMetaRef.current = null;
          setSolicitudId("");
          setPhase("idle");
          // Refs guard attemptConnect synchronously, before React rerenders.
          solicitudRef.current = "";
          phaseRef.current = "idle";
        }
        const ownAlias = await resolveAnonMatchSessionId();
        if (!ownAlias) throw new Error("missing_anon_session");
        const res = await fetchAnonMatch("/api/anon-match/shuffle-direct", {
          method: "POST",
          body: JSON.stringify({
            targetAnonId: wanted,
            solicitanteAnonId: ownAlias,
            ...readDiscoveryPayload(),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || !json?.chatId) {
          throw new Error(String(json?.error || "direct_chat_unavailable"));
        }
        await openDirectChat(String(json.chatId), "anonimo");
        // Direct cards navigate to the ordinary full-page chat route, not
        // the floating modal reserved for random matching.
        router.push(`/chat/${encodeURIComponent(String(json.chatId))}`);
      })().catch((err) => {
        console.warn("[anon-shuffle-direct] open failed", String(err?.message || err));
        window.alert("No se pudo abrir este chat. Si el anónimo sigue conectado, actualizá Shuffle e intentá otra vez.");
      }).finally(() => { shuffleDirectOpenInFlightRef.current = false; });
    };
    window.addEventListener("sayittome:anon-direct-target-request", onTarget);
    return () => window.removeEventListener("sayittome:anon-direct-target-request", onTarget);
  }, [clearRetryTimer, openDirectChat, router]);

  useEffect(() => {
    if (!solicitudId || phase !== "waiting") return;

    const ref = doc(db, "solicitudes_chat_anonimo", solicitudId);

    const handleFailure = () => {
      waitingMetaRef.current = null;
      if (targetAnonIdRef.current) {
        targetAnonIdRef.current = "";
        stopSearchSessionState({ setSearchSessionActive, setPhase, setSolicitudId, searchSessionActiveRef });
        return;
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

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const estado = String(data.estado || "pendiente") as AnonMatchRequestState;
        const chatId = String(data.chatId || "");

        if (estado === "aceptado" && chatId) {
          const acceptedRole = resolveAcceptedChatRole(
            resolveAnonMatchCallerKind(auth.currentUser),
          );
          openDirectChat(chatId, acceptedRole);
          return;
        }

        if (estado === "rechazado" || estado === "expirado" || estado === "cancelado") {
          if (estado === "rechazado") {
            rememberRejectedMatchTarget(
              resolveRejectedMatchTargetKey({
                destinatarioTipo: String(data.destinatarioTipo || ""),
                destinatarioUid: String(data.destinatarioUid || ""),
                anonId: String(data.anonId || ""),
              }),
            );
          }
          handleFailure();
        }
      },
      (error) => {
        // Do not abandon the solicitud on permission-denied — poll via API instead.
        console.warn("[anon-match] waiting solicitud snapshot error", error?.code || error);
      },
    );

    const pollWaiting = async () => {
      if (phaseRef.current !== "waiting" || solicitudRef.current !== solicitudId) return;
      if (!searchSessionActiveRef.current) return;

      try {
        const res = await fetchAnonMatch("/api/anon-match/request", {
          method: "PATCH",
          body: JSON.stringify({ solicitudId }),
        });
        const json = await res.json();
        const estado = String(json?.estado || "");
        const chatId = String(json?.chatId || "");

        if (estado === "aceptado" && chatId) {
          const acceptedRole = resolveAcceptedChatRole(
            resolveAnonMatchCallerKind(auth.currentUser),
          );
          openDirectChat(chatId, acceptedRole);
          return;
        }

        if (estado === "expirado" || estado === "rechazado" || estado === "cancelado") {
          if (estado === "rechazado") {
            try {
              const snap = await getDoc(doc(db, "solicitudes_chat_anonimo", solicitudId));
              if (snap.exists()) {
                const data = snap.data();
                rememberRejectedMatchTarget(
                  resolveRejectedMatchTargetKey({
                    destinatarioTipo: String(data.destinatarioTipo || ""),
                    destinatarioUid: String(data.destinatarioUid || ""),
                    anonId: String(data.anonId || ""),
                  }),
                );
              }
            } catch {
              // Best effort — retry without the exclude if read fails.
            }
          }
          handleFailure();
        }
      } catch {
        // Keep waiting; next poll retries.
      }
    };

    void pollWaiting();
    const pollTimer = window.setInterval(() => {
      void pollWaiting();
    }, WAITING_POLL_MS);

    const expiryTimer = window.setTimeout(() => {
      void pollWaiting();
    }, ANON_MATCH_REQUEST_MS + 500);

    return () => {
      unsub();
      window.clearInterval(pollTimer);
      window.clearTimeout(expiryTimer);
    };
  }, [openDirectChat, phase, scheduleRetry, solicitudId]);

  useEffect(() => {
    if (!hydrated || openChat?.chatId) return;

    const waitingForMatch = searchSessionActive && phase === "waiting";
    // Closing here must not mute the watcher forever — the next chat opened on
    // another device still has to land. Only the closed chat stays filtered out.
    if (waitingForMatch && skipServerDiscoveryRef.current) return;
    // A profile signed in on two devices has to pick up the chat the other one
    // opened, even on the device that never pressed Connect.
    if (!waitingForMatch && !matchDoorOpen) return;

    let cancelled = false;
    const unsubs: Array<() => void> = [];

    function watchActiveChats(
      chatQuery: ReturnType<typeof query>,
      role: "perfil" | "anonimo",
    ) {
      unsubs.push(
        onSnapshot(
          chatQuery,
          (snap) => {
            if (cancelled || snap.empty) return;
            const match = snap.docs.find((row) =>
              String((row.data() as Record<string, unknown>).source || "") !== "shuffle_direct",
            );
            if (!match) return;
            // Profile-like Shuffle DMs stay in Chats; they do not force a
            // fullscreen overlay or interrupt another live conversation.
            const chatId = match.id;
            if (chatId === lastClosedChatIdRef.current) return;
            openDirectChat(chatId, role);
          },
          (error) => {
            if (cancelled) return;
            console.warn("[anon-match] active chat snapshot error", error?.code || error);
          },
        ),
      );
    }

    void (async () => {
      const live = await resolveLiveAnonMatchCaller();
      if (live.isRegisteredProfile && live.registeredUid) {
        watchActiveChats(
          query(
            collection(db, "chats_anonimos"),
            where("solicitanteUid", "==", live.registeredUid),
            where("estado", "==", "activo"),
            limit(1),
          ),
          "perfil",
        );
        watchActiveChats(
          query(
            collection(db, "chats_anonimos"),
            where("destinatarioUid", "==", live.registeredUid),
            where("estado", "==", "activo"),
            limit(1),
          ),
          "perfil",
        );
        return;
      }

      // Anonymous aliases are tab-local, so there is nothing to sync across devices.
      if (!waitingForMatch) return;

      const anonId = await resolveAnonMatchSessionId().catch(() => "");
      if (cancelled || !anonId) return;

      watchActiveChats(
        query(
          collection(db, "chats_anonimos"),
          where("solicitanteAnonId", "==", anonId),
          where("estado", "==", "activo"),
          limit(1),
        ),
        "anonimo",
      );
      watchActiveChats(
        query(
          collection(db, "chats_anonimos"),
          where("anonId", "==", anonId),
          where("estado", "==", "activo"),
          limit(1),
        ),
        "anonimo",
      );
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [
    hydrated,
    matchDoorOpen,
    openChat?.chatId,
    openDirectChat,
    phase,
    searchSessionActive,
  ]);

  useEffect(() => {
    if (!incomingRequest?.solicitudId) return;

    const ref = doc(db, "solicitudes_chat_anonimo", incomingRequest.solicitudId);
    const receiverRole = incomingRequest.destinatarioTipo === "perfil" ? "perfil" : "anonimo";
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const estado = String(snap.data().estado || "");
        const chatId = String(snap.data().chatId || "");
        if (estado === "aceptado" && chatId) {
          openDirectChat(chatId, receiverRole);
          setIncomingRequest(null);
        }
      },
      (error) => {
        console.warn("[anon-match] incoming solicitud snapshot error", error?.code || error);
      },
    );

    return () => unsub();
  }, [incomingRequest?.destinatarioTipo, incomingRequest?.solicitudId, openDirectChat]);

  useEffect(() => {
    if (!hydrated) return;
    // Do not auto-sign anonymous / listen for matches until the door is open
    // (registered profile, or explicit anonymous shuffle enter).
    if (!matchDoorOpen) {
      setIncomingRequest(null);
      return;
    }

    let uid = "";
    let cancelled = false;
    let anonId = "";
    let anonDocs: IncomingRequest[] = [];
    let profileDocs: IncomingRequest[] = [];
    let apiDocs: IncomingRequest[] = [];
    const unsubs: Array<() => void> = [];
    let pollTimer: number | null = null;
    let liveListenerHealthy = false;
    let apiPollInFlight = false;

    function normalizeIncoming(
      item: { id: string; data: () => Record<string, unknown> },
      destinatarioTipo: "perfil" | "anonimo",
    ): IncomingRequest | null {
      const data = item.data();
      const estado = String(data.estado || "");
      if (estado !== "pendiente") return null;

      const expiresAt = String(data.expiresAt || "");
      const expiresDate = new Date(expiresAt);
      if (!Number.isNaN(expiresDate.getTime()) && expiresDate.getTime() <= Date.now()) {
        return null;
      }

      const solicitanteUid = String(data.solicitanteUid || "");
      const solicitanteAnonId = String(data.solicitanteAnonId || "");
      const targetAnonId = String(data.anonId || "");
      const destinatarioUid = String(data.destinatarioUid || "");

      if (solicitanteAnonId && solicitanteAnonId === targetAnonId) return null;
      if (solicitanteAnonId === anonId) return null;
      if (uid && solicitanteUid === uid) return null;
      if (isRejectedSolicitanteKey(resolveSolicitanteKey({ solicitanteUid, solicitanteAnonId }))) {
        return null;
      }
      if (isDismissedRequestId(item.id)) return null;
      if (destinatarioTipo === "perfil" && destinatarioUid !== uid) return null;
      if (destinatarioTipo === "anonimo" && targetAnonId !== anonId) return null;

      return {
        solicitudId: item.id,
        solicitanteUid,
        solicitanteAnonId,
        destinatarioTipo,
        expiresAt,
      };
    }

    function publishIncoming() {
      if (isLocalAnonMatchDndActive() || openChatRef.current?.chatId) {
        setIncomingRequest(null);
        return;
      }
      const byId = new Map<string, IncomingRequest>();
      for (const row of [...profileDocs, ...anonDocs, ...apiDocs]) {
        if (!byId.has(row.solicitudId)) byId.set(row.solicitudId, row);
      }
      const allDocs = Array.from(byId.values());
      const pending = allDocs
        .filter((row) => !isDismissedRequestId(row.solicitudId))
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
      const next = pending[0] || null;
      setIncomingRequest(next);

      if (
        next &&
        shouldAlertIncomingAnonMatchRequest({
          requestId: next.solicitudId,
          alreadyAlerted: alertedRequestIds.has(next.solicitudId),
          chatOpen: Boolean(openChatRef.current?.chatId),
        })
      ) {
        alertedRequestIds.add(next.solicitudId);
        alertIncomingAnonMatchRequest(next.solicitudId);
      }

      for (const id of [...alertedRequestIds]) {
        if (!pending.some((row) => row.solicitudId === id)) {
          dismissIncomingAnonMatchRequestAlert(id);
        }
      }

      // Only forget a dismissed id once Firestore no longer returns it as pending.
      for (const id of loadDismissedRequestIds()) {
        if (!allDocs.some((row) => row.solicitudId === id)) {
          forgetDismissedRequestId(id);
        }
      }
    }

    async function pollIncomingFromApi() {
      if (cancelled || document.hidden || liveListenerHealthy || apiPollInFlight) return;
      apiPollInFlight = true;
      try {
        const live = await resolveLiveAnonMatchCaller();
        let alias = "";
        if (!live.isRegisteredProfile) {
          alias = anonId || (await resolveAnonMatchSessionId().catch(() => ""));
        }
        const path = alias
          ? `/api/anon-match/incoming?anonId=${encodeURIComponent(alias)}`
          : "/api/anon-match/incoming";
        const res = await fetchAnonMatch(path, { method: "GET" });
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.ok || !Array.isArray(json.incoming)) return;

        apiDocs = (json.incoming as Array<Record<string, unknown>>)
          .map((row) => {
            const solicitudId = String(row.solicitudId || "").trim();
            if (!solicitudId || isDismissedRequestId(solicitudId)) return null;
            const solicitanteUid = String(row.solicitanteUid || "");
            const solicitanteAnonId = String(row.solicitanteAnonId || "");
            if (solicitanteAnonId && solicitanteAnonId === alias) return null;
            if (uid && solicitanteUid === uid) return null;
            if (
              isRejectedSolicitanteKey(
                resolveSolicitanteKey({ solicitanteUid, solicitanteAnonId }),
              )
            ) {
              return null;
            }
            const destinatarioTipo =
              String(row.destinatarioTipo || "") === "perfil" ? "perfil" : "anonimo";
            return {
              solicitudId,
              solicitanteUid,
              solicitanteAnonId,
              destinatarioTipo: destinatarioTipo as "perfil" | "anonimo",
              expiresAt: String(row.expiresAt || ""),
            } satisfies IncomingRequest;
          })
          .filter(Boolean) as IncomingRequest[];
        publishIncoming();
      } catch {
        // Poll is best-effort; Firestore listener may still deliver.
      } finally {
        apiPollInFlight = false;
      }
    }

    void (async () => {
      const live = await resolveLiveAnonMatchCaller();
      uid = live.registeredUid;
      const authUid = String(live.user?.uid || "").trim();
      const targets = resolveIncomingListenerTargets({
        callerKind: live.callerKind,
        registeredUid: live.registeredUid,
        serverAnonAlias: "",
        authUid,
      });

      if (!live.isRegisteredProfile) {
        anonId = await resolveAnonMatchSessionId().catch(() => "");
        if (cancelled || !anonId) return;
        targets.anonDestinatarioId = anonId;
      }

      if (targets.profileDestinatarioUid) {
        unsubs.push(
          onSnapshot(
            query(
              collection(db, "solicitudes_chat_anonimo"),
              where("destinatarioUid", "==", targets.profileDestinatarioUid),
              where("estado", "==", "pendiente"),
              limit(10),
            ),
            (snap) => {
              liveListenerHealthy = true;
              apiDocs = [];
              profileDocs = snap.docs
                .map((item) => normalizeIncoming(item, "perfil"))
                .filter(Boolean) as IncomingRequest[];
              publishIncoming();
            },
            (error) => {
              if (cancelled) return;
              liveListenerHealthy = false;
              void pollIncomingFromApi();
              console.warn(
                "[anon-match] profile incoming listener error",
                error?.code || error,
              );
            },
          ),
        );
      }

      // Privacy rules authorize via destinatarioAuthUid (== Firebase Auth uid).
      // Query must constrain that field or list is denied for anon <-> anon.
      if (targets.destinatarioAuthUid && targets.anonDestinatarioId) {
        unsubs.push(
          onSnapshot(
            query(
              collection(db, "solicitudes_chat_anonimo"),
              where("destinatarioAuthUid", "==", targets.destinatarioAuthUid),
              where("estado", "==", "pendiente"),
              limit(10),
            ),
            (snap) => {
              liveListenerHealthy = true;
              apiDocs = [];
              anonDocs = snap.docs
                .map((item) => {
                  const data = item.data();
                  const destinatarioTipo = String(data.destinatarioTipo || "");
                  if (destinatarioTipo === "perfil") return null;
                  return normalizeIncoming(item, "anonimo");
                })
                .filter(Boolean) as IncomingRequest[];
              publishIncoming();
            },
            (error) => {
              if (cancelled) return;
              liveListenerHealthy = false;
              void pollIncomingFromApi();
              console.warn(
                "[anon-match] anon incoming listener error",
                error?.code || error,
              );
            },
          ),
        );
      }

      // The onSnapshot listener is primary and instantaneous. The Admin API
      // fallback is only queried when Firestore cannot supply a snapshot.
      // Avoid reading Firestore again on every heartbeat for every session.
      pollTimer = window.setInterval(() => {
        void pollIncomingFromApi();
      }, INCOMING_POLL_MS);
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
  }, [firebaseUser?.isAnonymous, firebaseUser?.uid, hydrated, matchDoorOpen]);

  useEffect(() => {
    if (!openChat?.chatId) return;

    const ref = doc(db, "chats_anonimos", openChat.chatId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const estado = String(snap.data().estado || "activo");
        if (estado === "activo") return;

        // Closing on one device must not leave the chat waiting for a second
        // close on the others — only a peer's close deserves the banner.
        if (estado !== "denunciado" && closedByMe(String(snap.data().cerradoPor || ""))) {
          dismissChatLocally();
          return;
        }

        setOpenChat((prev) =>
          prev
            ? {
                ...prev,
                closedReason: estado === "denunciado" ? "denunciado" : "peer_closed",
              }
            : prev,
        );
      },
      (error) => {
        console.warn("[anon-match] open chat snapshot error", error?.code || error);
      },
    );

    return () => unsub();
  }, [dismissChatLocally, openChat?.chatId]);

  const respondIncoming = useCallback(
    async (accept: boolean) => {
      if (!incomingRequest || respondingIncomingRef.current) return;

      const solicitudId = incomingRequest.solicitudId;
      const receiverRole =
        incomingRequest.destinatarioTipo === "perfil" ? "perfil" : "anonimo";
      respondingIncomingRef.current = true;
      if (!accept) {
        dismissIncomingAnonMatchRequestAlert(solicitudId);
        rememberDismissedRequestId(solicitudId);
        rememberRejectedSolicitanteKey(
          resolveSolicitanteKey({
            solicitanteUid: incomingRequest.solicitanteUid,
            solicitanteAnonId: incomingRequest.solicitanteAnonId,
          }),
        );
        setIncomingRequest(null);
      } else {
        dismissIncomingAnonMatchRequestAlert(solicitudId);
      }

      try {
        const live = await withTimeout(
          resolveLiveAnonMatchCaller(),
          8_000,
          "anon_match_identity_timeout",
        );
        const responderUid = live.isRegisteredProfile ? live.registeredUid : "";
        let responderAnonId = "";
        if (receiverRole !== "perfil") {
          responderAnonId = await withTimeout(
            resolveAnonMatchSessionId(),
            8_000,
            "anon_match_alias_timeout",
          ).catch(() => "");
          if (!responderAnonId) return;
        }

        const buildRespondBody = (accepted: boolean) =>
          buildAnonMatchRespondBody({
            solicitudId,
            accept: accepted,
            receiverRole,
            registeredUid: responderUid,
            serverAnonAlias: responderAnonId,
          });

        if (!accept) {
          await withTimeout(
            fetchAnonMatch("/api/anon-match/respond", {
              method: "POST",
              body: JSON.stringify(buildRespondBody(false)),
            }),
            10_000,
            "anon_match_reject_timeout",
          ).catch(() => null);
          return;
        }

        const openAcceptedChat = (chatId: string) => {
          openDirectChat(chatId, receiverRole);
          setIncomingRequest(null);
        };

        const readAcceptedChatId = async () => {
          const snap = await withTimeout(
            getDoc(doc(db, "solicitudes_chat_anonimo", solicitudId)),
            8_000,
            "anon_match_read_timeout",
          );
          if (!snap.exists()) return "";
          const data = snap.data();
          if (String(data.estado || "") !== "aceptado") return "";
          return String(data.chatId || "");
        };

        try {
          const res = await withTimeout(
            fetchAnonMatch("/api/anon-match/respond", {
              method: "POST",
              body: JSON.stringify(buildRespondBody(true)),
            }),
            10_000,
            "anon_match_accept_timeout",
          );
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
            // Keep modal open and interactive so the user can retry.
          }
        }
      } catch {
        // Reject stays dismissed; accept stays visible and becomes retryable.
      } finally {
        respondingIncomingRef.current = false;
      }
    },
    [incomingRequest, openDirectChat],
  );

  const enableDoNotDisturb = useCallback(
    async (minutes: number) => {
      try {
        const res = await withTimeout(
          fetchAnonMatch("/api/anon-match/dnd", {
            method: "POST",
            body: JSON.stringify({ minutes }),
          }),
          10_000,
          "anon_match_dnd_timeout",
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return false;
        const until = String(json.doNotDisturbUntil || "").trim();
        if (until) writeLocalAnonMatchDndUntil(until);
        // Reject the current ping so the searcher moves on (and won't re-target
        // this recipient until they close a later chat — classic semantics).
        await respondIncoming(false);
        setIncomingRequest(null);
        return true;
      } catch {
        return false;
      }
    },
    [respondIncoming],
  );

  const minimizeChat = useCallback(() => setChatView("minimized"), [setChatView]);
  const restoreChat = useCallback(() => setChatView("compact"), [setChatView]);
  const expandChat = useCallback(() => setChatView("expanded"), [setChatView]);

  const closeChatWindow = useCallback(() => {
    const chatId = openChatRef.current?.chatId || "";
    dismissChatLocally();
    broadcastAnonDirectChatClosed(chatId);
  }, [dismissChatLocally]);

  useEffect(
    () =>
      subscribeAnonDirectChatClosed((chatId) => {
        if (!chatId || openChatRef.current?.chatId !== chatId) return;
        dismissChatLocally();
      }),
    [dismissChatLocally],
  );

  useEffect(() => () => clearRetryTimer(), [clearRetryTimer]);

  const anonDirectInboxRows = useMemo(
    () => bridgeAnonDirectShellsToInboxChats(
      Object.values(inboxShells),
      firebaseUser?.uid || "",
    ),
    [firebaseUser?.uid, inboxShells],
  );

  const value = useMemo<AnonMatchContextValue>(
    () => ({
      phase,
      searchSessionActive,
      solicitudId,
      openChat,
      chatView,
      incomingRequest,
      anonDirectInboxRows,
      startSearchSession,
      respondIncoming,
      enableDoNotDisturb,
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
      anonDirectInboxRows,
      startSearchSession,
      respondIncoming,
      enableDoNotDisturb,
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
