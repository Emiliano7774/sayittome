import {
  hashFcmToken as hashFcmTokenCore,
  parsePendingUnregister,
} from "@/lib/chat/fcmInstallation";
import { resolvePushTitle as resolvePushTitleCore } from "@/lib/chat/pushNotificationCopy";

export type FcmRegistrationStatus = "unknown" | "registering" | "active" | "error";

export type FcmRegistrationState = {
  uid: string;
  status: FcmRegistrationStatus;
  tokenHash: string;
  error: string;
  updatedAtMs: number;
};

export type OsPermissionStage = "not_asked" | "prompt" | "granted" | "denied" | "unknown" | "error";

const STATE_KEY = "sayittome:fcm-reg-state:v1";
const PENDING_UNREGISTER_KEY = "sayittome:fcm-pending-unregister:v1";

type Listener = (state: FcmRegistrationState) => void;

const listeners = new Map<string, Set<Listener>>();
const states = new Map<string, FcmRegistrationState>();

function asId(value: unknown) {
  return String(value || "").trim();
}

function emptyState(uid: string): FcmRegistrationState {
  return {
    uid,
    status: "unknown",
    tokenHash: "",
    error: "",
    updatedAtMs: 0,
  };
}

function persistStates() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify([...states.entries()]));
  } catch {
    // quota
  }
}

function hydrateOnce() {
  if (typeof window === "undefined" || states.size > 0) return;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, FcmRegistrationState]>;
    for (const [uid, state] of parsed) {
      if (uid && state) states.set(uid, state);
    }
  } catch {
    // ignore
  }
}

function notify(uid: string) {
  const state = getFcmRegistrationState(uid);
  for (const listener of listeners.get(uid) || []) listener(state);
}

export function hashFcmToken(token: string) {
  return hashFcmTokenCore(token).replace(/^t_/, "");
}

export function getFcmRegistrationState(uid: string): FcmRegistrationState {
  hydrateOnce();
  const clean = asId(uid);
  return states.get(clean) || emptyState(clean);
}

export function setFcmRegistrationState(
  uid: string,
  patch: Partial<Omit<FcmRegistrationState, "uid">>,
) {
  const clean = asId(uid);
  if (!clean) return getFcmRegistrationState("");
  const prev = getFcmRegistrationState(clean);
  const next: FcmRegistrationState = {
    ...prev,
    ...patch,
    uid: clean,
    updatedAtMs: Date.now(),
  };
  states.set(clean, next);
  persistStates();
  notify(clean);
  return next;
}

export function subscribeFcmRegistration(uid: string, listener: Listener) {
  const clean = asId(uid);
  if (!clean) {
    listener(emptyState(""));
    return () => undefined;
  }
  if (!listeners.has(clean)) listeners.set(clean, new Set());
  listeners.get(clean)!.add(listener);
  let active = true;
  listener(getFcmRegistrationState(clean));
  return () => {
    active = false;
    listeners.get(clean)?.delete(listener);
    if ((listeners.get(clean)?.size || 0) === 0) listeners.delete(clean);
    void active;
  };
}

export type PendingUnregister = {
  uid: string;
  token: string;
  tokenHash: string;
  installationId: string;
  proof?: string;
  createdAtMs: number;
};

export function readPendingUnregister(): PendingUnregister | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_UNREGISTER_KEY);
    if (!raw) return null;
    const parsed = parsePendingUnregister(JSON.parse(raw));
    if (!parsed) return null;
    return {
      ...parsed,
      createdAtMs: Number((JSON.parse(raw) as { createdAtMs?: number }).createdAtMs || 0),
    };
  } catch {
    return null;
  }
}

export function writePendingUnregister(row: PendingUnregister) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_UNREGISTER_KEY, JSON.stringify(row));
  } catch {
    // quota
  }
}

export function clearPendingUnregister() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_UNREGISTER_KEY);
  } catch {
    // ignore
  }
}

export function classifyOsPermission(receive: string | undefined): OsPermissionStage {
  const value = String(receive || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  if (value === "prompt" || value === "prompt-with-rationale") return "not_asked";
  return "unknown";
}

export function resolvePushTitle(input: {
  senderRole?: string;
  fromUid?: string;
  targetUsername?: string;
  displayName?: string;
}) {
  const role = String(input.senderRole || "").trim();
  const from = String(input.fromUid || "").trim();
  const username = String(input.targetUsername || input.displayName || "").trim();
  if (role === "anon" || from.startsWith("anon_")) {
    return resolvePushTitleCore({ senderRole: "anon", from, fromUid: from });
  }
  if (role === "profile" || from.startsWith("profile_")) {
    return username || "Nuevo mensaje";
  }
  return username || "Nuevo mensaje";
}

export function excludeSelfPushUids(
  recipients: Iterable<string>,
  message: { fromUid?: string; senderAuthUid?: string; createdByAuthUid?: string },
) {
  const next = new Set([...recipients].map(asId).filter(Boolean));
  const from = asId(message.fromUid);
  next.delete(from);
  next.delete(asId(message.senderAuthUid));
  next.delete(asId(message.createdByAuthUid));
  if (from.startsWith("profile_")) next.delete(from.slice("profile_".length));
  return [...next];
}
