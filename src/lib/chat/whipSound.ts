const WHIP_SRC = "/sounds/whip.mp3";
const COOLDOWN_MS = 1200;

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let lastPlayedAt = 0;

function getAudio() {
  if (typeof window === "undefined") return null;

  if (!audio) {
    audio = new Audio(WHIP_SRC);
    audio.preload = "auto";
    audio.volume = 0.75;
  }

  return audio;
}

export function unlockWhipSound() {
  if (unlocked || typeof window === "undefined") return;

  const el = getAudio();
  if (!el) return;

  unlocked = true;

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
  if (!unlocked) return;

  const now = Date.now();
  if (now - lastPlayedAt < COOLDOWN_MS) return;
  lastPlayedAt = now;

  const el = getAudio();
  if (!el) return;

  try {
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch {
    // Autoplay bloqueado: sin error visible.
  }
}

export function bindWhipSoundUnlock() {
  if (typeof window === "undefined") return () => {};

  const unlock = () => {
    unlockWhipSound();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}
