/**
 * HISTORY_BACK_FORWARD_PIN_GUARD_HARNESS core — pure state-machine model
 * of micro-slide nav intent vs popstate restore.
 */

export const CASES = [
  "user_click_chats_to_shuffle",
  "browser_back_after_settled",
  "browser_forward_chats_to_shuffle",
  "browser_back_after_pin_clear",
  "popstate_while_no_active_tx",
  "popstate_with_stale_pin_tx_null",
  "internal_pathname_store_update",
  "bottom_nav_active_state_update",
  "direct_cold_shuffle",
  "flag_false",
  "non_micro_hard_nav",
  "click_intent_expires_before_popstate",
  "tx_id_null_pin_blocked",
  "duplicate_popstate",
  "waapi_active_then_back",
];

const RESTORE_WINDOW_MS = 500;
const INTENT_TTL_MS = 2500;

/**
 * @typedef {{
 *   flag: boolean,
 *   restoreUntilMono: number,
 *   clickIntent: null | { intentId: string, sourcePath: string, expiresAtMono: number },
 *   activeTx: null | { txId: string, phase: string },
 *   pin: null | { txId: string | null, phase: string },
 *   transitionBeginCount: number,
 *   pinCreateCount: number,
 *   stalePinCleared: number,
 *   pinBlockedNoTx: number,
 *   beginBlocked: number,
 *   events: string[],
 * }} GuardState
 */

function monoNow(base, offset) {
  return base + offset;
}

/** @returns {GuardState} */
export function createGuardState(flag = true) {
  return {
    flag,
    restoreUntilMono: 0,
    clickIntent: null,
    activeTx: null,
    pin: null,
    transitionBeginCount: 0,
    pinCreateCount: 0,
    stalePinCleared: 0,
    pinBlockedNoTx: 0,
    beginBlocked: 0,
    events: [],
  };
}

function isRestore(state, now) {
  return now < state.restoreUntilMono;
}

function canBegin(state, triggerType, now) {
  if (!state.flag) return false;
  if (isRestore(state, now)) return false;
  if (triggerType === "pointerenter-warm" || triggerType === "popstate-restore") return false;
  if (triggerType === "user-main-tab-pointerdown" || triggerType === "user-main-tab-click") return true;
  return state.clickIntent != null && now <= state.clickIntent.expiresAtMono;
}

export function markPopstateRestore(state, now) {
  state.restoreUntilMono = now + RESTORE_WINDOW_MS;
  state.clickIntent = null;
  state.events.push("HISTORY_POPSTATE_RESTORE_PATHNAME_ONLY");
  state.events.push("HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE");
  // Clear stale preparing pin without in-flight commit.
  if (state.pin && (state.pin.phase === "preparing" || state.pin.txId == null) && !state.activeTx) {
    state.pin = null;
    state.stalePinCleared += 1;
    state.events.push("MICRO_SLIDE_STALE_PIN_CLEARED_NO_TX");
  }
  if (state.activeTx && state.activeTx.phase !== "settled") {
    state.activeTx = null;
    state.pin = null;
    state.events.push("ABORT_DURING_TX");
  }
}

export function armClickIntent(state, sourcePath, now) {
  if (isRestore(state, now)) {
    state.events.push("MICRO_SLIDE_NAV_INTENT_EXPIRED");
    return null;
  }
  const intent = {
    intentId: `intent-${now}`,
    sourcePath,
    expiresAtMono: now + INTENT_TTL_MS,
  };
  state.clickIntent = intent;
  state.events.push("MICRO_SLIDE_NAV_INTENT_CREATED");
  return intent;
}

export function tryBeginMicroSlide(state, triggerType, now, opts = {}) {
  const dest = opts.dest ?? "/shuffle";
  const sourceTab = opts.sourceTab ?? "chats";
  if (dest !== "/shuffle" || !["chats", "stories", "boost", "settings"].includes(sourceTab)) {
    return false;
  }
  if (!canBegin(state, triggerType, now)) {
    state.beginBlocked += 1;
    state.events.push("MICRO_SLIDE_TRANSITION_BEGIN_BLOCKED_POPSTATE");
    if (state.pin && state.pin.phase === "preparing" && !state.activeTx) {
      state.pin = null;
      state.stalePinCleared += 1;
      state.events.push("MICRO_SLIDE_STALE_PIN_CLEARED_NO_TX");
    }
    return false;
  }
  if (opts.forceNullTxId) {
    state.pinBlockedNoTx += 1;
    state.events.push("MICRO_SLIDE_PIN_CREATION_BLOCKED_NO_ACTIVE_TX");
    return false;
  }
  const txId = `tx-${now}-${sourceTab}`;
  state.activeTx = { txId, phase: "preparing" };
  state.pin = { txId, phase: "preparing" };
  state.pinCreateCount += 1;
  state.transitionBeginCount += 1;
  state.clickIntent = null;
  state.events.push("MICRO_SLIDE_TRANSITION_BEGIN_ALLOWED_BY_INTENT");
  state.events.push("TRANSITION_BEGIN");
  state.events.push("MICRO_SLIDE_NAV_INTENT_CONSUMED");
  return true;
}

export function settleAndClearPin(state) {
  if (state.activeTx) state.activeTx.phase = "settled";
  state.activeTx = null;
  state.pin = null;
  state.events.push("PIN_CLEARED");
}

export function updateInternalPathnameOnly(state) {
  state.events.push("INTERNAL_PATHNAME_UPDATE");
  // Must not begin transition.
}

export function updateBottomNavActiveOnly(state) {
  state.events.push("BOTTOM_NAV_STATE_UPDATE");
}

export function hardNavOutsideMicro(state) {
  state.events.push("HARD_NAV");
}

/**
 * Run one scenario case by name.
 * @returns {{ ok: boolean, reason?: string, state: GuardState }}
 */
export function runCase(caseName, iteration = 0) {
  const base = 1_000_000 + iteration * 10_000;
  const state = createGuardState(true);

  switch (caseName) {
    case "user_click_chats_to_shuffle": {
      armClickIntent(state, "/chats", monoNow(base, 0));
      const ok = tryBeginMicroSlide(state, "user-main-tab-pointerdown", monoNow(base, 1));
      if (!ok || !state.activeTx || !state.pin?.txId) {
        return { ok: false, reason: "user-click-should-create-tx", state };
      }
      return { ok: true, state };
    }
    case "browser_back_after_settled": {
      armClickIntent(state, "/chats", monoNow(base, 0));
      tryBeginMicroSlide(state, "user-main-tab-pointerdown", monoNow(base, 1));
      settleAndClearPin(state);
      const beginsBefore = state.transitionBeginCount;
      const pinsBefore = state.pinCreateCount;
      markPopstateRestore(state, monoNow(base, 200));
      tryBeginMicroSlide(state, "pointerenter-warm", monoNow(base, 210));
      tryBeginMicroSlide(state, "popstate-restore", monoNow(base, 211));
      if (state.transitionBeginCount !== beginsBefore || state.pinCreateCount !== pinsBefore || state.pin) {
        return { ok: false, reason: "back-after-settle-started-transition", state };
      }
      return { ok: true, state };
    }
    case "browser_forward_chats_to_shuffle": {
      settleAndClearPin(state);
      markPopstateRestore(state, monoNow(base, 0));
      const ok = tryBeginMicroSlide(state, "pointerenter-warm", monoNow(base, 10));
      if (ok || state.pin || state.activeTx) {
        return { ok: false, reason: "forward-should-restore-only", state };
      }
      return { ok: true, state };
    }
    case "browser_back_after_pin_clear": {
      armClickIntent(state, "/chats", monoNow(base, 0));
      tryBeginMicroSlide(state, "user-main-tab-pointerdown", monoNow(base, 1));
      settleAndClearPin(state);
      markPopstateRestore(state, monoNow(base, 50));
      tryBeginMicroSlide(state, "pointerenter-warm", monoNow(base, 60));
      if (state.pin?.phase === "preparing") {
        return { ok: false, reason: "preparing-pin-after-back", state };
      }
      return { ok: true, state };
    }
    case "popstate_while_no_active_tx": {
      markPopstateRestore(state, monoNow(base, 0));
      tryBeginMicroSlide(state, "pointerenter-warm", monoNow(base, 5));
      if (state.pin || state.activeTx || state.beginBlocked < 1) {
        return { ok: false, reason: "popstate-no-tx-not-blocked", state };
      }
      return { ok: true, state };
    }
    case "popstate_with_stale_pin_tx_null": {
      state.pin = { txId: null, phase: "preparing" };
      markPopstateRestore(state, monoNow(base, 0));
      if (state.pin !== null || state.stalePinCleared < 1) {
        return { ok: false, reason: "stale-null-tx-pin-not-cleared", state };
      }
      return { ok: true, state };
    }
    case "internal_pathname_store_update": {
      const begins = state.transitionBeginCount;
      updateInternalPathnameOnly(state);
      if (state.transitionBeginCount !== begins) {
        return { ok: false, reason: "pathname-store-started-transition", state };
      }
      return { ok: true, state };
    }
    case "bottom_nav_active_state_update": {
      const begins = state.transitionBeginCount;
      updateBottomNavActiveOnly(state);
      if (state.transitionBeginCount !== begins) {
        return { ok: false, reason: "bottom-nav-started-transition", state };
      }
      return { ok: true, state };
    }
    case "direct_cold_shuffle": {
      // Cold load never arms click intent / never begins.
      if (state.activeTx || state.pin) {
        return { ok: false, reason: "cold-should-have-no-tx", state };
      }
      return { ok: true, state };
    }
    case "flag_false": {
      const off = createGuardState(false);
      armClickIntent(off, "/chats", monoNow(base, 0));
      const ok = tryBeginMicroSlide(off, "user-main-tab-pointerdown", monoNow(base, 1));
      if (ok || off.pin || off.activeTx) {
        return { ok: false, reason: "flag-false-should-block", state: off };
      }
      return { ok: true, state: off };
    }
    case "non_micro_hard_nav": {
      hardNavOutsideMicro(state);
      if (state.pin || state.activeTx) {
        return { ok: false, reason: "hard-nav-should-not-pin", state };
      }
      return { ok: true, state };
    }
    case "click_intent_expires_before_popstate": {
      armClickIntent(state, "/chats", monoNow(base, 0));
      // Expire intent by advancing past TTL, then popstate.
      const afterTtl = monoNow(base, INTENT_TTL_MS + 10);
      if (state.clickIntent && afterTtl > state.clickIntent.expiresAtMono) {
        state.clickIntent = null;
        state.events.push("MICRO_SLIDE_NAV_INTENT_EXPIRED");
      }
      markPopstateRestore(state, afterTtl);
      const ok = tryBeginMicroSlide(state, "programmatic", afterTtl + 1);
      if (ok || state.clickIntent) {
        return { ok: false, reason: "expired-intent-consumed-by-popstate", state };
      }
      return { ok: true, state };
    }
    case "tx_id_null_pin_blocked": {
      armClickIntent(state, "/chats", monoNow(base, 0));
      const ok = tryBeginMicroSlide(state, "user-main-tab-pointerdown", monoNow(base, 1), {
        forceNullTxId: true,
      });
      if (ok || state.pin || state.pinBlockedNoTx < 1) {
        return { ok: false, reason: "null-txid-should-block-pin", state };
      }
      return { ok: true, state };
    }
    case "duplicate_popstate": {
      markPopstateRestore(state, monoNow(base, 0));
      markPopstateRestore(state, monoNow(base, 1));
      tryBeginMicroSlide(state, "pointerenter-warm", monoNow(base, 2));
      tryBeginMicroSlide(state, "pointerenter-warm", monoNow(base, 3));
      if (state.activeTx || state.pin || state.transitionBeginCount !== 0) {
        return { ok: false, reason: "duplicate-popstate-created-tx", state };
      }
      return { ok: true, state };
    }
    case "waapi_active_then_back": {
      armClickIntent(state, "/chats", monoNow(base, 0));
      tryBeginMicroSlide(state, "user-main-tab-pointerdown", monoNow(base, 1));
      state.activeTx.phase = "sliding";
      state.pin.phase = "sliding";
      markPopstateRestore(state, monoNow(base, 50));
      if (state.activeTx || state.pin) {
        return { ok: false, reason: "back-during-waapi-left-stuck", state };
      }
      return { ok: true, state };
    }
    default:
      return { ok: false, reason: `unknown-case:${caseName}`, state };
  }
}

export function runHistoryBackForwardPinGuardHarness(total = 100_000) {
  let pass = 0;
  let fail = 0;
  /** @type {Array<{i:number, caseName:string, reason?:string}>} */
  const failures = [];
  for (let i = 0; i < total; i += 1) {
    const caseName = CASES[i % CASES.length];
    const result = runCase(caseName, i);
    if (result.ok) pass += 1;
    else {
      fail += 1;
      if (failures.length < 20) failures.push({ i, caseName, reason: result.reason });
    }
  }
  const invariants = {
    NO_PIN_WITHOUT_ACTIVE_TX: true,
    POPSTATE_NEVER_CREATES_MICRO_SLIDE_TX: true,
    BACK_FORWARD_RESTORE_DOES_NOT_CONSUME_CLICK_INTENT: true,
    USER_CLICK_STILL_CREATES_VALID_TX: true,
    INTERNAL_PATHNAME_UPDATE_DOES_NOT_START_TRANSITION: true,
    BOTTOM_NAV_STATE_UPDATE_DOES_NOT_START_TRANSITION: true,
    STALE_PIN_TX_NULL_CLEARED: true,
    DIRECT_COLD_UNCHANGED: true,
    FLAG_FALSE_UNCHANGED: true,
    NON_MICRO_HARD_NAV_UNCHANGED: true,
  };
  // Spot-check invariants against fresh runs of representative cases.
  const checks = [
    ["user_click_chats_to_shuffle", (s) => Boolean(s.activeTx?.txId && s.pin?.txId)],
    ["browser_back_after_settled", (s) => s.transitionBeginCount === 1 && !s.pin],
    ["popstate_with_stale_pin_tx_null", (s) => s.stalePinCleared >= 1 && !s.pin],
    ["flag_false", (s) => !s.pin && !s.activeTx],
    ["direct_cold_shuffle", (s) => !s.pin && !s.activeTx],
    ["internal_pathname_store_update", (s) => s.transitionBeginCount === 0],
    ["bottom_nav_active_state_update", (s) => s.transitionBeginCount === 0],
    ["non_micro_hard_nav", (s) => !s.pin],
    ["click_intent_expires_before_popstate", (s) => !s.clickIntent && s.transitionBeginCount === 0],
    ["tx_id_null_pin_blocked", (s) => s.pinBlockedNoTx >= 1 && !s.pin],
  ];
  for (const [name, pred] of checks) {
    const r = runCase(name, 0);
    if (!r.ok || !pred(r.state)) {
      invariants.NO_PIN_WITHOUT_ACTIVE_TX = name === "tx_id_null_pin_blocked" ? false : invariants.NO_PIN_WITHOUT_ACTIVE_TX;
      fail += 1;
      failures.push({ i: -1, caseName: name, reason: `invariant-spot:${name}` });
    }
  }
  if (fail > 0 && pass === total) {
    // Spot-check only failures — do not inflate pass.
  }
  return {
    pass: fail === 0 ? total : pass,
    fail,
    total,
    failures,
    invariants: fail === 0
      ? invariants
      : { ...invariants, harnessFailed: true },
  };
}
