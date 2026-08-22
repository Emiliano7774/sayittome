export type MessageLongPressPhase = "idle" | "pending" | "fired" | "moved";

export type MessageLongPressState = {
  phase: MessageLongPressPhase;
  startX: number;
  startY: number;
  pointerId: number | null;
  suppressClick: boolean;
};

export const MESSAGE_LONG_PRESS_MS = 480;
export const MESSAGE_LONG_PRESS_MOVE_PX = 12;

const IDLE: MessageLongPressState = {
  phase: "idle",
  startX: 0,
  startY: 0,
  pointerId: null,
  suppressClick: false,
};

export function createMessageLongPressState(): MessageLongPressState {
  return { ...IDLE };
}

export function reduceMessageLongPress(
  state: MessageLongPressState,
  event:
    | { type: "down"; x: number; y: number; pointerId: number }
    | { type: "move"; x: number; y: number }
    | { type: "up" }
    | { type: "cancel" }
    | { type: "fire" }
    | { type: "consume-click" },
): MessageLongPressState {
  if (event.type === "consume-click") {
    return { ...state, suppressClick: false };
  }
  if (event.type === "down") {
    return {
      phase: "pending",
      startX: event.x,
      startY: event.y,
      pointerId: event.pointerId,
      suppressClick: false,
    };
  }
  if (event.type === "move") {
    if (state.phase !== "pending") return state;
    const dx = event.x - state.startX;
    const dy = event.y - state.startY;
    if (dx * dx + dy * dy >= MESSAGE_LONG_PRESS_MOVE_PX * MESSAGE_LONG_PRESS_MOVE_PX) {
      return { ...state, phase: "moved" };
    }
    return state;
  }
  if (event.type === "fire") {
    if (state.phase !== "pending") return state;
    return { ...state, phase: "fired", suppressClick: true };
  }
  if (event.type === "up" || event.type === "cancel") {
    if (state.phase === "fired") {
      return { ...IDLE, suppressClick: true };
    }
    return { ...IDLE, suppressClick: state.suppressClick };
  }
  return state;
}

export function shouldSuppressMessageClick(state: MessageLongPressState) {
  return state.suppressClick || state.phase === "fired";
}
