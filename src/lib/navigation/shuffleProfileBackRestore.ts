/**
 * Shuffle → profile → back must keep the pinned snapshot and never paint a
 * dual-hidden black frame. Hardware back and the profile UI back share this
 * reducer so they cannot diverge.
 */

export type ShuffleProfileBackPath = "/shuffle" | "/u/profile";

export type ShuffleProfileBackState = {
  path: ShuffleProfileBackPath;
  keepAliveActive: boolean;
  instantReturnPending: boolean;
  revealFromArmed: boolean;
  hostFrozen: boolean;
  hostVisible: boolean;
  surfacePresented: boolean;
  snapshotRetained: boolean;
  routeShellHidden: boolean;
  remounted: boolean;
};

export type ShuffleProfileBackEvent =
  | { type: "open-profile" }
  | { type: "hardware-back" }
  | { type: "ui-back" }
  | { type: "route-commit-shuffle" };

export function initialShuffleProfileBackState(): ShuffleProfileBackState {
  return {
    path: "/shuffle",
    keepAliveActive: true,
    instantReturnPending: false,
    revealFromArmed: false,
    hostFrozen: false,
    hostVisible: true,
    surfacePresented: true,
    snapshotRetained: true,
    routeShellHidden: false,
    remounted: false,
  };
}

export function isShuffleProfileBackBlackFrame(state: ShuffleProfileBackState) {
  const revealing =
    state.path === "/shuffle" ||
    state.instantReturnPending ||
    state.revealFromArmed;
  if (!revealing) return false;
  if (state.routeShellHidden && !state.hostVisible) return true;
  if (state.path === "/shuffle" && !state.hostVisible) return true;
  if (state.hostFrozen && state.path === "/shuffle") return true;
  return false;
}

function beginProfileBack(state: ShuffleProfileBackState): ShuffleProfileBackState {
  return {
    ...state,
    instantReturnPending: true,
    revealFromArmed: true,
    hostFrozen: false,
    hostVisible: true,
    surfacePresented: true,
    snapshotRetained: true,
    remounted: false,
    routeShellHidden: false,
  };
}

export function reduceShuffleProfileBack(
  state: ShuffleProfileBackState,
  event: ShuffleProfileBackEvent,
): ShuffleProfileBackState {
  if (event.type === "open-profile") {
    return {
      ...state,
      path: "/u/profile",
      keepAliveActive: true,
      instantReturnPending: false,
      revealFromArmed: false,
      hostFrozen: true,
      hostVisible: false,
      surfacePresented: true,
      snapshotRetained: true,
      routeShellHidden: false,
      remounted: false,
    };
  }

  if (event.type === "hardware-back" || event.type === "ui-back") {
    return beginProfileBack(state);
  }

  if (event.type === "route-commit-shuffle") {
    return {
      ...state,
      path: "/shuffle",
      instantReturnPending: false,
      revealFromArmed: false,
      hostFrozen: false,
      hostVisible: true,
      surfacePresented: true,
      snapshotRetained: true,
      remounted: false,
      routeShellHidden: false,
    };
  }

  return state;
}
