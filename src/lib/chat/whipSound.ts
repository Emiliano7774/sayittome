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

export function unlockWhipSound() {
  if (unlocked || typeof window === "undefined") return;

  const el = getPooledAudio();
  if (!el) return;

  unlocked = true;
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
        })
        .catch(() => {
          el.muted = false;
        });
    }
  } catch {
    el.muted = false;
  }
}

export function playIncomingWhipSound() {
  const now = Date.now();
  if (now - lastPlayedAt < COOLDOWN_MS) return;

  const el = getPooledAudio();
  if (!el) return;

  lastPlayedAt = now;

  try {
    el.currentTime = 0;
    el.muted = false;
    void el.play().catch(() => undefined);
  } catch {
    // Autoplay bloqueado.
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
    if (!document.hidden) unlockWhipSound();
  });

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("click", unlock);
    window.removeEventListener("pageshow", unlock);
  };
}
