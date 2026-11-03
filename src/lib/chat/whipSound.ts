const WHIP_SRC = "/sounds/whip.mp3";
const COOLDOWN_MS = 900;

let unlocked = false;
let lastPlayedAt = 0;
let notificationPermissionRequested = false;
// Several independent chat surfaces mount the unlock hook at the same time.
// Keep exactly one global listener set; repeated DOM events must never start
// overlapping HTMLAudioElement.play() requests on the input-critical path.
let unlockSubscribers = 0;
let detachUnlockListeners: (() => void) | null = null;
let unlockInFlight = false;
let unlockAttemptStartedAt = 0;
let unlockAttemptId = 0;
let nextUserUnlockAttemptAt = 0;
let audioPool: HTMLAudioElement[] = [];
let poolIndex = 0;

function getPooledAudio() {
  if (typeof window === "undefined") return null;

  if (audioPool.length === 0) {
    for (let i = 0; i < 3; i += 1) {
      const node = new Audio(WHIP_SRC);
      node.preload = "auto";
      node.volume = 0.82;
      audioPool.push(node);
    }
  }

  const node = audioPool[poolIndex % audioPool.length];
  poolIndex += 1;
  return node;
}

function requestNotificationPermission() {
  if (notificationPermissionRequested || typeof window === "undefined") return;
  notificationPermissionRequested = true;
  void import("@/lib/chat/chatNotificationPrefs")
    .then(({ areChatNotificationsEnabled }) => {
      if (!areChatNotificationsEnabled()) return;
      return import("@/lib/chat/chatNotifications").then(({ requestChatNotificationPermission }) =>
        requestChatNotificationPermission(),
      );
    })
    .catch(() => undefined);
}

export function unlockWhipSound(options?: { force?: boolean }) {
  if (typeof window === "undefined") return;
  if (unlocked && !options?.force) return;
  // Pointerdown, touchstart and click fire for the same physical touch.
  // Audio play is asynchronous; coalesce in-flight calls and back off an
  // unsuccessful *passive* unlock, never an actual incoming-message sound.
  const now = Date.now();
  // A suspended Android WebView can leave play() unresolved indefinitely.
  // Expire only that stale attempt, then allow a fresh user interaction to
  // unlock sound; a late promise must not overwrite the newer attempt.
  if (unlockInFlight && now - unlockAttemptStartedAt < 4000) return;
  if (!options?.force && now < nextUserUnlockAttemptAt) return;

  const el = getPooledAudio();
  if (!el) return;

  requestNotificationPermission();
  nextUserUnlockAttemptAt = now + 650;
  unlockInFlight = true;
  unlockAttemptStartedAt = now;
  const attemptId = ++unlockAttemptId;

  try {
    el.muted = true;
    const playPromise = el.play();
    if (playPromise) {
      void playPromise
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          if (attemptId === unlockAttemptId) unlocked = true;
        })
        .catch(() => {
          el.muted = false;
          if (attemptId === unlockAttemptId) unlocked = false;
        })
        .finally(() => {
          if (attemptId === unlockAttemptId) unlockInFlight = false;
        });
    } else {
      unlocked = true;
      unlockInFlight = false;
    }
  } catch {
    el.muted = false;
    unlocked = false;
    unlockInFlight = false;
  }
}

/** Android WebView often suspends audio after background; force a fresh prime. */
export function reprimeWhipSound() {
  unlocked = false;
  unlockWhipSound({ force: true });
}

export function playIncomingWhipSound(): boolean {
  const now = Date.now();
  if (now - lastPlayedAt < COOLDOWN_MS) return false;

  if (!unlocked) {
    unlockWhipSound({ force: true });
  }

  const el = getPooledAudio();
  if (!el) return false;

  lastPlayedAt = now;

  try {
    el.currentTime = 0;
    el.muted = false;
    const playPromise = el.play();
    if (playPromise) {
      void playPromise.catch(() => {
        unlocked = false;
      });
    }
    return true;
  } catch {
    unlocked = false;
    return false;
  }
}

export function notifyIncomingChatMessage(input: {
  title: string;
  body: string;
  chatId?: string;
  messageId?: string;
  viewingActiveChat?: boolean;
}) {
  void import("@/lib/chat/chatNotifications")
    .then(({ showChatNotification }) => showChatNotification(input))
    .catch(() => undefined);
}

export function bindWhipSoundUnlock() {
  if (typeof window === "undefined") return () => {};

  unlockSubscribers += 1;
  if (!detachUnlockListeners) {
    const unlock = () => unlockWhipSound();
    const onVisible = () => {
      if (!document.hidden) unlockWhipSound({ force: true });
    };
    // Pointer Events cover finger, stylus and mouse in current Android/desktop.
    // touchstart+click for each same gesture previously multiplied the work.
    const needsLegacyFallback = !("PointerEvent" in window);
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    if (needsLegacyFallback) {
      window.addEventListener("touchstart", unlock, { passive: true });
      window.addEventListener("click", unlock, { passive: true });
    }
    window.addEventListener("pageshow", unlock);
    document.addEventListener("visibilitychange", onVisible);

    detachUnlockListeners = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (needsLegacyFallback) {
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("click", unlock);
      }
      window.removeEventListener("pageshow", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    unlockSubscribers = Math.max(0, unlockSubscribers - 1);
    if (unlockSubscribers === 0) {
      detachUnlockListeners?.();
      detachUnlockListeners = null;
    }
  };
}
