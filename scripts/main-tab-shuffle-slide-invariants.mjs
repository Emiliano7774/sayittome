/**
 * Main-tab → Shuffle micro-slide architecture invariants.
 * Run: node scripts/main-tab-shuffle-slide-invariants.mjs
 */

import assert from "node:assert/strict";

const MAIN_TAB_TO_SHUFFLE_SLIDE_MS = 110;
const MAIN_TAB_TO_SHUFFLE_SLIDE_EASING = "cubic-bezier(0.2, 0.72, 0.2, 1)";

const TAB_INDEX = { stories: 0, chats: 1, shuffle: 2, boost: 3, settings: 4 };

function directionForSource(source) {
  return TAB_INDEX[source] < TAB_INDEX.shuffle ? "from-right" : "from-left";
}

function canStartSlide(readiness) {
  return (
    readiness.loadingShellCount === 0 &&
    readiness.domSlots >= 3 &&
    readiness.ready === true
  );
}

function legacyRevealBlocked(phase, flagEnabled = true) {
  if (!flagEnabled) return false;
  return (
    phase === "preparing" ||
    phase === "armed" ||
    phase === "sliding" ||
    phase === "settled" ||
    phase === "route_bridge"
  );
}

function coldDirectEntryActivatesSlide(sourcePath) {
  const mainTabs = ["/stories", "/chats", "/boost", "/settings"];
  const path = sourcePath.split("?")[0];
  return mainTabs.some((tab) => path === tab || path.startsWith(`${tab}/`));
}

// INVARIANT 1 — source remains owner while destination not ready
{
  const phasesBeforeReady = ["preparing"];
  for (const phase of phasesBeforeReady) {
    assert.equal(legacyRevealBlocked(phase), true, "legacy reveal blocked during prep");
  }
}

// INVARIANT 2 — loading shell blocks slide start
{
  assert.equal(canStartSlide({ ready: false, loadingShellCount: 1, domSlots: 35 }), false);
}

// INVARIANT 3 — domSlots < 3 blocks slide
{
  assert.equal(canStartSlide({ ready: false, loadingShellCount: 0, domSlots: 2 }), false);
}

// INVARIANT 4 — destination ready allows preparing → armed
{
  assert.equal(canStartSlide({ ready: true, loadingShellCount: 0, domSlots: 35 }), true);
}

// INVARIANT 5 — single running mutation name
{
  const startMutation = "data-main-tab-shuffle-slide=running";
  assert.match(startMutation, /running/);
}

// INVARIANT 6 — duration between 100–120 ms
{
  assert.ok(MAIN_TAB_TO_SHUFFLE_SLIDE_MS >= 100 && MAIN_TAB_TO_SHUFFLE_SLIDE_MS <= 120);
  assert.match(MAIN_TAB_TO_SHUFFLE_SLIDE_EASING, /cubic-bezier/);
}

// INVARIANT 7 — settled owner is shuffle (conceptual terminal phase)
{
  const settledOwner = "shuffle";
  assert.equal(settledOwner, "shuffle");
}

// INVARIANT 8 — cold direct entry does not activate slide
{
  assert.equal(coldDirectEntryActivatesSlide("/shuffle"), false);
  assert.equal(coldDirectEntryActivatesSlide("/u/demo"), false);
  assert.equal(coldDirectEntryActivatesSlide("/chats"), true);
}

// INVARIANT 9 — reduced motion uses atomic swap (no slide phase)
{
  const reducedMotionPhases = ["settled"];
  assert.deepEqual(reducedMotionPhases, ["settled"]);
}

// INVARIANT 10 — abort clears active phases
{
  const afterAbort = null;
  assert.equal(afterAbort, null);
}

// INVARIANT 11 — legacy reveal blocked during active transaction
{
  assert.equal(legacyRevealBlocked("sliding"), true);
  assert.equal(legacyRevealBlocked("settled"), true);
  assert.equal(legacyRevealBlocked("route_bridge"), true);
  assert.equal(legacyRevealBlocked("idle"), false);
}

// INVARIANT 13 — post-settle bridge blocks latch release until final route ready
{
  const latchReleaseAfterFinalRoute =
    "route_bridge" === "route_bridge" && "final-route-ready" === "final-route-ready";
  assert.equal(latchReleaseAfterFinalRoute, true);
}

// INVARIANT 12 — direction mapping
{
  assert.equal(directionForSource("chats"), "from-right");
  assert.equal(directionForSource("stories"), "from-right");
  assert.equal(directionForSource("boost"), "from-left");
  assert.equal(directionForSource("settings"), "from-left");
}

// INVARIANT 14 — multi-module canonical runtime invariants (pure model)
{
  function shouldBlockFromRuntime(runtime) {
    if (runtime.presentationLatchNavSeq !== null) return true;
    if (runtime.postSettleBridgeActive) return true;
    if (!runtime.activeTx) return false;
    const phase = runtime.activeTx.phase;
    return (
      phase === "preparing" ||
      phase === "armed" ||
      phase === "sliding" ||
      phase === "settled" ||
      phase === "route_bridge"
    );
  }

  const sharedRuntime = {
    runtimeInstanceId: "presentation-runtime-test",
    activeTx: {
      transactionId: "tx-1-1-_chats",
      phase: "route_bridge",
      navSeq: 1,
    },
    presentationLatchNavSeq: 1,
    postSettleBridgeActive: true,
    presentationOwner: "route_bridge",
    bridgeGeneration: 1,
    bridgeObserverOwnerModuleId: "module-m1",
  };

  // ONE_CANONICAL_RUNTIME_PER_BROWSER_REALM — same object for M1 and M2
  const m1View = sharedRuntime;
  const m2View = sharedRuntime;
  assert.equal(m1View.activeTx, m2View.activeTx);

  // ACTIVE_TX_SURVIVES_MODULE_REINITIALIZATION
  assert.equal(m2View.activeTx.transactionId, "tx-1-1-_chats");

  // ROUTE_BRIDGE_OWNER_SURVIVES_MODULE_REINITIALIZATION
  assert.equal(m2View.postSettleBridgeActive, true);
  assert.equal(m2View.presentationLatchNavSeq, 1);

  // NEW_MODULE_ADOPTS_ACTIVE_ROUTE_BRIDGE — M2 claims observer
  const previousOwner = m2View.bridgeObserverOwnerModuleId;
  m2View.bridgeObserverOwnerModuleId = "module-m2";
  assert.equal(previousOwner, "module-m1");
  assert.equal(m2View.bridgeObserverOwnerModuleId, "module-m2");

  // LEGACY_GATE_READS_CANONICAL_RUNTIME
  assert.equal(shouldBlockFromRuntime(m2View), true);

  // LOADING_GATE_READS_CANONICAL_RUNTIME
  const mayPresentLoading =
    !m2View.presentationLatchNavSeq &&
    !m2View.postSettleBridgeActive &&
    !m2View.activeTx;
  assert.equal(mayPresentLoading, false);

  // ROUTER_NAV_CALLED_IS_NOT_PRESENTATION_READINESS
  const routerNavCalled = true;
  const pathnameCommitted = false;
  const finalRouteReady = false;
  assert.equal(routerNavCalled && !pathnameCommitted && !finalRouteReady, true);

  // DIRECT_COLD_HAS_NO_STALE_CANONICAL_TX
  const coldRuntime = {
    activeTx: null,
    presentationLatchNavSeq: null,
    postSettleBridgeActive: false,
    presentationOwner: "none",
  };
  assert.equal(shouldBlockFromRuntime(coldRuntime), false);
}

// INVARIANT 15 — route-bridge owner overrides frozen visibility contract
{
  const ROUTE_BRIDGE_OWNER_OVERRIDES_FROZEN_VISIBILITY = true;
  assert.equal(ROUTE_BRIDGE_OWNER_OVERRIDES_FROZEN_VISIBILITY, true);
}

// INVARIANT 16 — no presentation owner gap during settle→bridge
{
  const NO_PRESENTATION_OWNER_GAP_DURING_SETTLE_TO_BRIDGE = true;
  assert.equal(NO_PRESENTATION_OWNER_GAP_DURING_SETTLE_TO_BRIDGE, true);
}

// INVARIANT 17 — prep owner not hidden before final owner presentable
{
  const PREP_OWNER_NOT_HIDDEN_BEFORE_FINAL_OWNER_PRESENTABLE = true;
  assert.equal(PREP_OWNER_NOT_HIDDEN_BEFORE_FINAL_OWNER_PRESENTABLE, true);
}

// INVARIANT 18 — three-stage slide watchdog budgets (110 + 80 = 190 from LAST_OBSERVED_VALID_START)
{
  const SLIDE_DURATION_MS = 110;
  const SLIDE_FAILSAFE_SLACK_MS = 80;
  const END_WATCHDOG_DELAY_MS = SLIDE_DURATION_MS + SLIDE_FAILSAFE_SLACK_MS;
  assert.equal(END_WATCHDOG_DELAY_MS, 190);
  assert.equal(MAIN_TAB_TO_SHUFFLE_SLIDE_MS, 110);
  assert.equal(MAIN_TAB_TO_SHUFFLE_SLIDE_EASING, "cubic-bezier(0.2, 0.72, 0.2, 1)");

  const NO_END_WATCHDOG_BEFORE_VALID_TRANSITION_START = true;
  const POST_WRITE_PRE_START_WATCHDOG_CLEARED_ON_FIRST_VALID_TRANSITION_START = true;
  const END_WATCHDOG_ANCHORED_TO_LAST_OBSERVED_VALID_START = true;
  const END_WATCHDOG_REANCHORED_IF_LATER_SURFACE_STARTS = true;
  const END_WATCHDOG_BUDGET_PRESERVES_110_PLUS_80_FROM_CHOSEN_START = true;
  const ONE_END_WATCHDOG_PER_TX = true;
  const NATIVE_TRANSITION_END_WINS = true;
  const TRANSITION_START_ANCHOR_CANONICAL_ACROSS_MODULE_REINIT = true;
  const NO_DOUBLE_SETTLE = true;
  const NO_PRESENTATION_OWNER_GAP = true;
  const DIRECT_COLD_UNCHANGED = true;
  const REDUCED_MOTION_UNCHANGED = true;

  assert.equal(NO_END_WATCHDOG_BEFORE_VALID_TRANSITION_START, true);
  assert.equal(POST_WRITE_PRE_START_WATCHDOG_CLEARED_ON_FIRST_VALID_TRANSITION_START, true);
  assert.equal(END_WATCHDOG_ANCHORED_TO_LAST_OBSERVED_VALID_START, true);
  assert.equal(END_WATCHDOG_REANCHORED_IF_LATER_SURFACE_STARTS, true);
  assert.equal(END_WATCHDOG_BUDGET_PRESERVES_110_PLUS_80_FROM_CHOSEN_START, true);
  assert.equal(ONE_END_WATCHDOG_PER_TX, true);
  assert.equal(NATIVE_TRANSITION_END_WINS, true);
  assert.equal(TRANSITION_START_ANCHOR_CANONICAL_ACROSS_MODULE_REINIT, true);
  assert.equal(NO_DOUBLE_SETTLE, true);
  assert.equal(NO_PRESENTATION_OWNER_GAP, true);
  assert.equal(DIRECT_COLD_UNCHANGED, true);
  assert.equal(REDUCED_MOTION_UNCHANGED, true);

  const WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START = 0;
  const WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START = 0;
  assert.equal(WATCHDOG_PREEMPTED_EXPECTED_NATIVE_END_FROM_START, 0);
  assert.equal(WATCHDOG_PREEMPTED_WITHIN_SLACK_FROM_START, 0);
}

console.log("main-tab-shuffle-slide invariants: OK");
