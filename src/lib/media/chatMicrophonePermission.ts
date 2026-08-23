import { Capacitor } from "@capacitor/core";

export const TRUSTED_MIC_ORIGIN = "https://sayittome-app.web.app";

export type ChatMicrophonePermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "blocked";

export type ChatMicrophonePermissionResult = {
  allowed: boolean;
  denied: boolean;
  blocked: boolean;
  state: ChatMicrophonePermissionState | "unavailable";
};

export type ChatMicNotice = "denied" | "blocked" | "failed" | null;

type NativeMicBridge = {
  check: () => string;
  request: (requestId: string) => void;
  openSettings?: () => void;
};

type MicWindow = Window & {
  SayItToMeMic?: NativeMicBridge;
  __sayittomeMicPermissionResult?: (requestId: string, state: string) => void;
  __sayittomeMicResume?: () => void;
};

let askedThisSession = false;
let resumeHooked = false;

function originOf(win: Window) {
  try {
    return String(win.location?.origin || "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function isTrustedTopLevelMicrophoneContext(win?: Window | null) {
  if (!win) return false;
  try {
    if (win.top !== win) return false;
  } catch {
    return false;
  }
  return originOf(win) === TRUSTED_MIC_ORIGIN;
}

function nativeBridge(): NativeMicBridge | null {
  if (typeof window === "undefined") return null;
  if (!isTrustedTopLevelMicrophoneContext(window)) return null;
  const bridge = (window as MicWindow).SayItToMeMic;
  if (!bridge || typeof bridge.check !== "function" || typeof bridge.request !== "function") {
    return null;
  }
  return bridge;
}

export function isNativeChatMicrophoneShell() {
  return Capacitor.isNativePlatform();
}

export function resetChatMicrophonePermissionSession() {
  askedThisSession = false;
}

export function didAskChatMicrophoneThisSession() {
  return askedThisSession;
}

function normalizeState(value: unknown): ChatMicrophonePermissionState | "unavailable" {
  const state = String(value || "").trim().toLowerCase();
  if (state === "granted" || state === "denied" || state === "prompt" || state === "blocked") {
    return state;
  }
  return "unavailable";
}

function resultFromState(
  state: ChatMicrophonePermissionState | "unavailable",
): ChatMicrophonePermissionResult {
  return {
    allowed: state === "granted",
    denied: state === "denied" || state === "blocked",
    blocked: state === "blocked",
    state,
  };
}

export function noticeFromMicrophonePermission(
  result: ChatMicrophonePermissionResult,
): ChatMicNotice {
  if (result.allowed) return null;
  if (result.blocked) return "blocked";
  if (result.denied) return "denied";
  return "failed";
}

/**
 * Native RECORD_AUDIO: request once from the tap, then capture.
 * Missing bridge must still start capture so WebChromeClient can show the OS prompt.
 * Never treat native NotAllowedError as a browser-permission failure.
 */
export function planChatMicrophoneStart(input: {
  native: boolean;
  bridgeState: ChatMicrophonePermissionState | "missing" | "unavailable";
}): {
  requestNative: boolean;
  startCapture: boolean;
  notice: ChatMicNotice;
  openSettings: boolean;
} {
  if (!input.native) {
    return { requestNative: false, startCapture: true, notice: null, openSettings: false };
  }
  if (input.bridgeState === "granted") {
    return { requestNative: false, startCapture: true, notice: null, openSettings: false };
  }
  if (input.bridgeState === "blocked") {
    return { requestNative: false, startCapture: false, notice: "blocked", openSettings: true };
  }
  if (input.bridgeState === "denied") {
    return { requestNative: false, startCapture: false, notice: "denied", openSettings: false };
  }
  if (input.bridgeState === "missing") {
    return { requestNative: false, startCapture: true, notice: null, openSettings: false };
  }
  if (input.bridgeState === "unavailable") {
    return { requestNative: false, startCapture: true, notice: null, openSettings: false };
  }
  return { requestNative: true, startCapture: false, notice: null, openSettings: false };
}

function hookResumeRecheck() {
  if (resumeHooked || typeof window === "undefined") return;
  resumeHooked = true;
  const onResume = () => {
    askedThisSession = false;
  };
  (window as MicWindow).__sayittomeMicResume = onResume;
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onResume();
  });
  window.addEventListener("focus", onResume);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForNativeBridge(timeoutMs = 400): Promise<NativeMicBridge | null> {
  const existing = nativeBridge();
  if (existing) return existing;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await wait(50);
    const next = nativeBridge();
    if (next) return next;
  }
  return nativeBridge();
}

function requestNativeMic(
  bridge: NativeMicBridge,
  timeoutMs = 20_000,
): Promise<ChatMicrophonePermissionState | "unavailable"> {
  const requestId = `mic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const previous = (window as MicWindow).__sayittomeMicPermissionResult;
    const finish = (state: ChatMicrophonePermissionState | "unavailable") => {
      window.clearTimeout(timer);
      (window as MicWindow).__sayittomeMicPermissionResult = previous;
      resolve(state);
    };
    const timer = window.setTimeout(() => finish("unavailable"), timeoutMs);
    (window as MicWindow).__sayittomeMicPermissionResult = (id, state) => {
      if (id !== requestId) return;
      finish(normalizeState(state));
    };
    try {
      bridge.request(requestId);
    } catch {
      finish("unavailable");
    }
  });
}

export function openChatMicrophoneSettings() {
  if (typeof window === "undefined") return;
  const bridge = nativeBridge();
  if (typeof bridge?.openSettings === "function") {
    bridge.openSettings();
  }
}

/**
 * RECORD_AUDIO once on record tap. Never call from send.
 * Capture starts only after grant. Settings only when permanently blocked.
 */
export async function ensureChatMicrophonePermission(): Promise<ChatMicrophonePermissionResult> {
  hookResumeRecheck();

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return resultFromState("unavailable");
  }

  if (!isNativeChatMicrophoneShell()) {
    return { allowed: true, denied: false, blocked: false, state: "prompt" };
  }

  if (!isTrustedTopLevelMicrophoneContext(window)) {
    return { allowed: true, denied: false, blocked: false, state: "prompt" };
  }

  const bridge = await waitForNativeBridge();
  if (!bridge) {
    return { allowed: true, denied: false, blocked: false, state: "prompt" };
  }

  const live = normalizeState(bridge.check());
  if (live === "granted") {
    return resultFromState("granted");
  }
  if (live === "blocked") {
    return resultFromState("blocked");
  }

  askedThisSession = true;
  const next = await requestNativeMic(bridge);
  const confirmed = normalizeState(bridge.check());
  if (confirmed === "granted" || next === "granted") {
    return resultFromState("granted");
  }
  if (confirmed === "blocked" || next === "blocked") {
    return resultFromState("blocked");
  }
  if (next === "denied" || confirmed === "denied") {
    return resultFromState("denied");
  }
  if (next === "unavailable" && confirmed === "prompt") {
    return { allowed: true, denied: false, blocked: false, state: "prompt" };
  }
  return resultFromState(next);
}

export function isPermissionLikeCaptureError(error: unknown) {
  const name =
    error instanceof DOMException
      ? error.name
      : String((error as { name?: string } | null)?.name || "");
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}

export function noticeFromCaptureFailure(input: {
  classified: "denied" | "failed";
  permissionState?: ChatMicrophonePermissionState | "unavailable" | "missing";
}): ChatMicNotice {
  if (input.classified === "denied") return "denied";
  if (input.permissionState === "blocked") return "blocked";
  if (
    input.permissionState === "prompt" ||
    input.permissionState === "denied" ||
    input.permissionState === "unavailable" ||
    input.permissionState === "missing"
  ) {
    return "denied";
  }
  return "failed";
}

export function isRealChatMicrophoneDenial(input: {
  nativeDenied?: boolean;
  error?: unknown;
  nativePlatform?: boolean;
}) {
  if (input.nativeDenied) return true;
  return isPermissionLikeCaptureError(input.error);
}
