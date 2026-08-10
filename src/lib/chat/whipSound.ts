const WHIP_SRC = "/sounds/whip.mp3";
const COOLDOWN_MS = 900;

let unlocked = false;
let lastPlayedAt = 0;
let notificationPermissionRequested = false;
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

  const el = getPooledAudio();
  if (!el) return;

  requestNotificationPermission();

  try {
    el.muted = true;
    const playPromise = el.play();
    if (playPromise) {
      playPromise
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          unlocked = true;
        })
        .catch(() => {
          el.muted = false;
          unlocked = false;
        });
    } else {
      unlocked = true;
    }
  } catch {
    el.muted = false;
    unlocked = false;
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
}) {
  void import("@/lib/chat/chatNotifications")
    .then(({ showChatNotification }) => showChatNotification(input))
    .catch(() => undefined);
}

export function bindWhipSoundUnlock() {
  if (typeof window === "undefined") return () => {};

  const unlock = () => unlockWhipSound();

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("click", unlock, { passive: true });
  window.addEventListener("pageshow", unlock);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) unlockWhipSound({ force: true });
  });

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("click", unlock);
    window.removeEventListener("pageshow", unlock);
  };
}
