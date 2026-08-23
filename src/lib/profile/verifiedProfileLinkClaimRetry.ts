import {
  clearVerifiedProfileLinkTicket,
  maybeClaimVerifiedProfileLink,
  peekVerifiedProfileLinkTicket,
  type VerifiedProfileLinkClaimResult,
} from "@/lib/profile/verifiedProfileLinkTicket";

export const VERIFIED_PROFILE_LINK_CLAIM_RETRY_MAX_DELAY_MS = 30_000;
export const VERIFIED_PROFILE_LINK_CLAIM_RETRY_BASE_DELAY_MS = 1_000;

export type VerifiedProfileLinkClaimRetryDeps = {
  getOwnerUid: () => string;
  callClaim?: (payload: {
    ticketId: string;
    chatId: string;
    messageId: string;
  }) => Promise<unknown>;
  nowMs?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  addWindowListener?: (
    type: "online" | "visibilitychange" | "pageshow",
    listener: () => void,
  ) => void;
  removeWindowListener?: (
    type: "online" | "visibilitychange" | "pageshow",
    listener: () => void,
  ) => void;
  isOnline?: () => boolean;
  isDocumentVisible?: () => boolean;
  onResult?: (result: VerifiedProfileLinkClaimResult) => void;
};

export function nextVerifiedProfileLinkClaimRetryDelayMs(attempt: number) {
  const exp = Math.max(0, Math.floor(attempt));
  const delay =
    VERIFIED_PROFILE_LINK_CLAIM_RETRY_BASE_DELAY_MS * 2 ** Math.min(exp, 5);
  return Math.min(delay, VERIFIED_PROFILE_LINK_CLAIM_RETRY_MAX_DELAY_MS);
}

/**
 * Claim only an already-bound ticket. Never binds a new message.
 */
export async function claimBoundVerifiedProfileLinkTicket(input: {
  ownerUid: string;
  callClaim?: (payload: {
    ticketId: string;
    chatId: string;
    messageId: string;
  }) => Promise<unknown>;
}): Promise<VerifiedProfileLinkClaimResult> {
  const pending = peekVerifiedProfileLinkTicket(input.ownerUid);
  if (!pending) {
    return { ok: false, stage: "peek", error: "no_ticket", retryable: false };
  }
  if (!pending.boundChatId || !pending.boundMessageId) {
    return { ok: false, stage: "bind", error: "not_bound", retryable: false };
  }
  return maybeClaimVerifiedProfileLink({
    chatId: pending.boundChatId,
    messageId: pending.boundMessageId,
    text: pending.text,
    ownerUid: input.ownerUid,
    callClaim: input.callClaim,
  });
}

export type VerifiedProfileLinkClaimRetryController = {
  arm: () => void;
  kick: () => void;
  disarm: () => void;
  isInFlight: () => boolean;
  getAttempt: () => number;
};

export function createVerifiedProfileLinkClaimRetryController(
  deps: VerifiedProfileLinkClaimRetryDeps,
): VerifiedProfileLinkClaimRetryController {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
  const addWindowListener =
    deps.addWindowListener ??
    ((type, listener) => {
      if (typeof window === "undefined") return;
      window.addEventListener(type, listener);
    });
  const removeWindowListener =
    deps.removeWindowListener ??
    ((type, listener) => {
      if (typeof window === "undefined") return;
      window.removeEventListener(type, listener);
    });
  const isOnline =
    deps.isOnline ??
    (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const isDocumentVisible =
    deps.isDocumentVisible ??
    (() =>
      typeof document === "undefined" ? true : document.visibilityState !== "hidden");

  let armed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let kickAgain = false;

  const onOnline = () => {
    kick();
  };
  const onVisible = () => {
    if (isDocumentVisible()) kick();
  };

  function clearTimer() {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function schedule(delayMs: number) {
    clearTimer();
    timer = setTimeoutFn(() => {
      timer = null;
      void runOnce();
    }, delayMs);
  }

  async function runOnce() {
    if (inFlight) {
      kickAgain = true;
      return;
    }

    inFlight = (async () => {
      const ownerUid = String(deps.getOwnerUid() || "").trim();
      if (!ownerUid) return;

      const pending = peekVerifiedProfileLinkTicket(ownerUid, nowMs());
      if (!pending) {
        attempt = 0;
        clearTimer();
        return;
      }
      if (!pending.boundChatId || !pending.boundMessageId) {
        // Unbound reserved ticket waits for send bind — retry must not consume it.
        return;
      }
      if (pending.expiresAtMs <= nowMs()) {
        clearVerifiedProfileLinkTicket();
        attempt = 0;
        clearTimer();
        return;
      }
      if (!isOnline()) {
        schedule(nextVerifiedProfileLinkClaimRetryDelayMs(attempt));
        return;
      }

      const result = await claimBoundVerifiedProfileLinkTicket({
        ownerUid,
        callClaim: deps.callClaim,
      });
      deps.onResult?.(result);

      if (result.ok || !result.retryable) {
        attempt = 0;
        clearTimer();
        return;
      }

      attempt += 1;
      schedule(nextVerifiedProfileLinkClaimRetryDelayMs(attempt - 1));
    })().finally(() => {
      inFlight = null;
      if (kickAgain) {
        kickAgain = false;
        void runOnce();
      }
    });

    await inFlight;
  }

  function kick() {
    void runOnce();
  }

  function arm() {
    if (!armed) {
      armed = true;
      addWindowListener("online", onOnline);
      addWindowListener("visibilitychange", onVisible);
      addWindowListener("pageshow", onVisible);
    }
    kick();
  }

  function disarm() {
    armed = false;
    clearTimer();
    kickAgain = false;
    removeWindowListener("online", onOnline);
    removeWindowListener("visibilitychange", onVisible);
    removeWindowListener("pageshow", onVisible);
  }

  return {
    arm,
    kick,
    disarm,
    isInFlight: () => Boolean(inFlight),
    getAttempt: () => attempt,
  };
}

let sharedController: VerifiedProfileLinkClaimRetryController | null = null;
let sharedOwnerUid = "";

export function armVerifiedProfileLinkClaimRetry(ownerUid: string) {
  const uid = String(ownerUid || "").trim();
  if (!uid || typeof window === "undefined") return;

  if (!sharedController || sharedOwnerUid !== uid) {
    sharedController?.disarm();
    sharedOwnerUid = uid;
    sharedController = createVerifiedProfileLinkClaimRetryController({
      getOwnerUid: () => sharedOwnerUid,
    });
  }
  sharedController.arm();
}

/** Non-blocking schedule after a transient claim (never awaits). */
export function scheduleVerifiedProfileLinkClaimRetry(ownerUid: string) {
  const uid = String(ownerUid || "").trim();
  if (!uid || typeof window === "undefined") return;
  armVerifiedProfileLinkClaimRetry(uid);
  sharedController?.kick();
}

export function disarmVerifiedProfileLinkClaimRetry() {
  sharedController?.disarm();
  sharedController = null;
  sharedOwnerUid = "";
}
