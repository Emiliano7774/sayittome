import { pickPreferredChatAudioMimeType } from "@/lib/media/chatAudioPlayback";
import { isRealChatMicrophoneDenial } from "@/lib/media/chatMicrophonePermission";

export type ChatAudioPhase = "idle" | "arming" | "recording" | "preview";

export type ChatAudioEvent =
  | { type: "tap" }
  | { type: "pointer-up" }
  | { type: "pointer-cancel" }
  | { type: "permission-denied" }
  | { type: "stream-ready" }
  | { type: "blob-ready" }
  | { type: "blob-too-small" }
  | { type: "error" }
  | { type: "reset" };

export type ChatAudioDecision = {
  phase: ChatAudioPhase;
  startCapture: boolean;
  stopCapture: boolean;
  showDenied: boolean;
  showFailed: boolean;
};

const IDLE: ChatAudioDecision = {
  phase: "idle",
  startCapture: false,
  stopCapture: false,
  showDenied: false,
  showFailed: false,
};

function decide(
  phase: ChatAudioPhase,
  patch: Partial<ChatAudioDecision> = {},
): ChatAudioDecision {
  return {
    phase,
    startCapture: false,
    stopCapture: false,
    showDenied: false,
    showFailed: false,
    ...patch,
  };
}

/**
 * Tap-to-toggle recorder. Permission dialogs cancel the original pointer,
 * so pointer-up/cancel during `arming` must not abort the in-flight start.
 */
export function reduceChatAudioEvent(
  phase: ChatAudioPhase,
  event: ChatAudioEvent,
): ChatAudioDecision {
  if (event.type === "reset") return { ...IDLE };

  if (event.type === "permission-denied") {
    return decide("idle", { showDenied: true });
  }

  if (event.type === "error" || event.type === "blob-too-small") {
    return decide("idle", { showFailed: true });
  }

  if (event.type === "blob-ready") {
    return decide("preview");
  }

  if (event.type === "stream-ready") {
    if (phase === "arming" || phase === "idle") {
      return decide("recording");
    }
    return decide(phase);
  }

  if (event.type === "pointer-up" || event.type === "pointer-cancel") {
    if (phase === "arming") return decide("arming");
    if (phase === "recording") return decide("recording", { stopCapture: true });
    return decide(phase);
  }

  if (event.type === "tap") {
    if (phase === "idle" || phase === "preview") {
      return decide("arming", { startCapture: true });
    }
    if (phase === "arming") {
      return decide("arming");
    }
    if (phase === "recording") {
      return decide("recording", { stopCapture: true });
    }
  }

  return decide(phase);
}

export function isChatAudioPermissionDenied(error: unknown) {
  return isRealChatMicrophoneDenial({ error, nativePlatform: false });
}

export function classifyChatAudioCaptureFailure(
  error: unknown,
  native?: {
    denied?: boolean;
    nativeDenied?: boolean;
    granted?: boolean;
    nativePlatform?: boolean;
    permissionState?: "granted" | "denied" | "prompt" | "blocked" | "unavailable" | "missing";
  },
): "denied" | "failed" {
  const osGranted = native?.granted === true || native?.permissionState === "granted";
  if (
    isRealChatMicrophoneDenial({
      error,
      nativeDenied: native?.nativeDenied === true || native?.denied === true,
      nativePlatform: native?.nativePlatform === true,
      osGranted,
      permissionState: native?.permissionState,
    })
  ) {
    return "denied";
  }
  return "failed";
}

export const CHAT_AUDIO_MIN_BYTES = 512;

export function pickSupportedAudioMimeType() {
  return pickPreferredChatAudioMimeType();
}
