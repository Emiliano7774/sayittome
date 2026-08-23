export const CHAT_AUDIO_HOLD_TOUCH_SLOP_PX = 12;
export const CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX = 72;
export const CHAT_AUDIO_HOLD_LOCK_HYSTERESIS_PX = 16;

export type ChatAudioHoldLockPhase = "idle" | "holding" | "locking" | "locked";

export type ChatAudioHoldLockState = {
  phase: ChatAudioHoldLockPhase;
  pointerId: number | null;
  originX: number;
  originY: number;
  liftPx: number;
  lockProgress: number;
  suppressClick: boolean;
};

export type ChatAudioHoldLockEvent =
  | { type: "pointerdown"; pointerId: number; x: number; y: number }
  | { type: "pointermove"; pointerId: number; x: number; y: number }
  | { type: "pointerup"; pointerId: number }
  | { type: "pointercancel"; pointerId: number }
  | { type: "lostcapture"; pointerId: number }
  | { type: "activate" }
  | { type: "stop" }
  | { type: "cancel" }
  | { type: "unmount" }
  | { type: "reset" }
  | { type: "consume-click" };

export type ChatAudioHoldLockDecision = {
  state: ChatAudioHoldLockState;
  startCapture: boolean;
  stopCapture: boolean;
  discardCapture: boolean;
  capturePointer: boolean;
  releasePointer: boolean;
  consumeClick: boolean;
};

const IDLE: ChatAudioHoldLockState = {
  phase: "idle",
  pointerId: null,
  originX: 0,
  originY: 0,
  liftPx: 0,
  lockProgress: 0,
  suppressClick: false,
};

export function createChatAudioHoldLockState(): ChatAudioHoldLockState {
  return { ...IDLE };
}

export function chatAudioHoldLockLiftPx(originY: number, y: number) {
  return Math.max(0, originY - y);
}

export function chatAudioHoldLockProgress(liftPx: number) {
  const span = CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX - CHAT_AUDIO_HOLD_TOUCH_SLOP_PX;
  if (span <= 0) return liftPx >= CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX ? 1 : 0;
  return Math.max(0, Math.min(1, (liftPx - CHAT_AUDIO_HOLD_TOUCH_SLOP_PX) / span));
}

export function formatChatAudioHoldTimer(elapsedMs: number) {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export type ChatAudioHoldElapsedEvent =
  | { type: "recording-started" }
  | { type: "tick"; startedAtMs: number; nowMs: number }
  | { type: "recording-stopped" };

/** Elapsed display. A new recording must snap to 0, not the previous tick. */
export function reduceChatAudioHoldElapsed(
  _elapsedMs: number,
  event: ChatAudioHoldElapsedEvent,
) {
  if (event.type === "recording-started" || event.type === "recording-stopped") {
    return 0;
  }
  if (event.startedAtMs <= 0) return 0;
  return Math.max(0, event.nowMs - event.startedAtMs);
}

function samePointer(state: ChatAudioHoldLockState, pointerId: number) {
  return state.pointerId !== null && state.pointerId === pointerId;
}

function decide(
  state: ChatAudioHoldLockState,
  patch: Partial<ChatAudioHoldLockDecision> = {},
): ChatAudioHoldLockDecision {
  return {
    state,
    startCapture: false,
    stopCapture: false,
    discardCapture: false,
    capturePointer: false,
    releasePointer: false,
    consumeClick: false,
    ...patch,
  };
}

function withLift(state: ChatAudioHoldLockState, liftPx: number): ChatAudioHoldLockState {
  return {
    ...state,
    liftPx,
    lockProgress: chatAudioHoldLockProgress(liftPx),
  };
}

function idle(suppressClick = false): ChatAudioHoldLockState {
  return { ...IDLE, suppressClick };
}

/**
 * Press-and-hold → optional slide-up lock. Release before lock stops.
 * Locked release keeps recording. Extra pointers are ignored.
 */
export function reduceChatAudioHoldLock(
  state: ChatAudioHoldLockState,
  event: ChatAudioHoldLockEvent,
): ChatAudioHoldLockDecision {
  if (event.type === "reset" || event.type === "unmount") {
    const active = state.phase !== "idle";
    return decide(idle(), {
      discardCapture: active,
      releasePointer: state.pointerId !== null,
    });
  }

  if (event.type === "consume-click") {
    return decide({ ...state, suppressClick: false });
  }

  if (event.type === "cancel") {
    if (state.phase === "idle") return decide(state);
    return decide(idle(true), {
      discardCapture: true,
      releasePointer: state.pointerId !== null,
      consumeClick: true,
    });
  }

  if (event.type === "stop") {
    if (state.phase === "idle") return decide(state);
    return decide(idle(true), {
      stopCapture: true,
      releasePointer: state.pointerId !== null,
      consumeClick: true,
    });
  }

  if (event.type === "activate") {
    if (state.phase !== "idle") return decide(state);
    return decide(
      {
        ...IDLE,
        phase: "locked",
        liftPx: CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
        lockProgress: 1,
        suppressClick: true,
      },
      { startCapture: true, consumeClick: true },
    );
  }

  if (event.type === "pointerdown") {
    if (state.phase === "locked") return decide(state);
    if (state.phase !== "idle") return decide(state, { consumeClick: true });
    return decide(
      {
        phase: "holding",
        pointerId: event.pointerId,
        originX: event.x,
        originY: event.y,
        liftPx: 0,
        lockProgress: 0,
        suppressClick: false,
      },
      { startCapture: true, capturePointer: true },
    );
  }

  if (
    event.type === "pointermove" ||
    event.type === "pointerup" ||
    event.type === "pointercancel" ||
    event.type === "lostcapture"
  ) {
    if (!samePointer(state, event.pointerId)) {
      return decide(state);
    }
  }

  if (event.type === "pointermove") {
    if (state.phase === "locked") {
      return decide(state);
    }
    if (state.phase !== "holding" && state.phase !== "locking") {
      return decide(state);
    }

    const liftPx = chatAudioHoldLockLiftPx(state.originY, event.y);
    if (liftPx >= CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX) {
      return decide(
        {
          ...state,
          phase: "locked",
          liftPx: CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
          lockProgress: 1,
        },
        { releasePointer: true },
      );
    }

    const dropBelow =
      state.phase === "locking" &&
      liftPx < CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX - CHAT_AUDIO_HOLD_LOCK_HYSTERESIS_PX &&
      liftPx < CHAT_AUDIO_HOLD_TOUCH_SLOP_PX;

    if (state.phase === "holding" && liftPx < CHAT_AUDIO_HOLD_TOUCH_SLOP_PX) {
      return decide(withLift(state, liftPx));
    }

    if (dropBelow) {
      return decide(withLift({ ...state, phase: "holding" }, liftPx));
    }

    return decide(withLift({ ...state, phase: "locking" }, liftPx));
  }

  if (
    event.type === "pointerup" ||
    event.type === "pointercancel" ||
    event.type === "lostcapture"
  ) {
    if (state.phase === "locked") {
      return decide(
        { ...state, pointerId: null, suppressClick: true },
        { releasePointer: true, consumeClick: true },
      );
    }
    if (state.phase === "holding" || state.phase === "locking") {
      return decide(idle(true), {
        stopCapture: true,
        releasePointer: true,
        consumeClick: true,
      });
    }
    return decide(state);
  }

  return decide(state);
}
