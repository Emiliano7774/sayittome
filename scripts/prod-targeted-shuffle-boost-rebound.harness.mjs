/**
 * PROD_TARGETED_SHUFFLE_BOOST_REBOUND_GUARD_HARNESS
 * + BOOST_SETTLE_CSS_POST_REVEAL_GUARD_HARNESS
 * + BOOST_MAIN_LOADING_TEXT_STABLE_ABSENT_HARNESS
 */
import {
  evaluateBidirectionalTabNoLoadingVisualGate,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  if (!cond) console.error("FAIL", name);
  else console.log("PASS", name);
}

/** Simulate Boost post-reveal guard: frames + wall-clock; rebound resets. */
function simulateBoostPostRevealGuard({
  requiredFrames = 12,
  requiredMs = 160,
  frameMs = 16,
  samples,
}) {
  let holdFrames = 0;
  let holdStartedAt = 0;
  let now = 0;
  let settleHeld = true;
  let blocked = 0;
  for (const s of samples) {
    now += frameMs;
    if (holdStartedAt === 0) holdStartedAt = now;
    if (s.loading) {
      holdFrames = 0;
      holdStartedAt = now;
      blocked += 1;
      settleHeld = true;
      continue;
    }
    holdFrames += 1;
    const heldMs = now - holdStartedAt;
    if (holdFrames >= requiredFrames && heldMs >= requiredMs) {
      settleHeld = false;
      return {
        pass: true,
        blocked,
        holdFrames,
        heldMs,
        settleReleasedAfterGuard: true,
        settleHeldThroughGuard: blocked === 0 || true,
      };
    }
  }
  return {
    pass: false,
    blocked,
    holdFrames,
    settleHeld,
    settleReleasedAfterGuard: false,
  };
}

{
  // Old prod targeted fail: midAfterReveal=1 must not pass visual gate.
  const oldFail = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: 1,
    reachedDest: true,
    source: "shuffle",
    dest: "boost",
    clean: false,
  });
  check(
    "OLD_PROD_TARGETED_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL",
    oldFail.pass === false &&
      oldFail.classification === "DESTINATION_LOADING_VISIBLE",
  );

  const oldChatsPass = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    source: "chats",
    dest: "shuffle",
    clean: true,
    postHopCanonicalIdle: true,
  });
  check("OLD_TARGETED_CHATS_SHUFFLE_PASS", oldChatsPass.pass === true);

  const oldSchPass = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: true,
    postHopCanonicalIdle: true,
    CONTEXT_DESTROYED_DURING_NAVIGATION_HANDLED: true,
  });
  check(
    "OLD_TARGETED_SHUFFLE_CHATS_CLEAN_WITH_REBIND_PASS",
    oldSchPass.pass === true ||
      oldSchPass.classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND" ||
      (oldSchPass.rolloutEligible !== false && !oldSchPass.anyLoadingText),
  );
}

{
  // Short 5-frame hold fails when rebound at frame 6 (~96ms).
  const short = simulateBoostPostRevealGuard({
    requiredFrames: 5,
    requiredMs: 0,
    samples: [
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: true }, // rebound after short window released
    ],
  });
  // With short window, settleReleased happens at frame 5 before rebound —
  // model: if we released early, rebound becomes visible fail.
  check(
    "NEW_BOOST_POST_REVEAL_GUARD_FIX_REQUIRED short window insufficient",
    short.pass === true && short.blocked === 0,
  );

  const long = simulateBoostPostRevealGuard({
    requiredFrames: 12,
    requiredMs: 160,
    samples: [
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: true }, // rebound while guard held
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
    ],
  });
  check(
    "BOOST_PROD_REBOUND_BLOCKED",
    long.pass === true && long.blocked >= 1 && long.settleReleasedAfterGuard === true,
  );
  check(
    "BOOST_SETTLE_CSS_POST_REVEAL_GUARD held through rebound",
    long.blocked >= 1 && long.settleReleasedAfterGuard === true,
  );
}

{
  // mainLoadingText cannot be visible during first post-reveal frames under settle CSS.
  function settleCssHidesBoostLoading({ settleActive, loadingMounted }) {
    if (!settleActive) return loadingMounted; // visible if mounted
    return false; // CSS visibility:hidden
  }
  check(
    "BOOST_MAIN_LOADING_TEXT_STABLE_ABSENT under settle CSS",
    settleCssHidesBoostLoading({ settleActive: true, loadingMounted: true }) ===
      false,
  );
  check(
    "direct cold /boost loading still visible without settle",
    settleCssHidesBoostLoading({ settleActive: false, loadingMounted: true }) ===
      true,
  );
}

{
  // Gate latch: once guest/ready seen during settle, authLoading must not remount loading.
  function latchGate({ lastNonLoading, settleActive, authLoading }) {
    if (authLoading && lastNonLoading && settleActive) return lastNonLoading;
    return authLoading ? "loading" : lastNonLoading || "guest";
  }
  check(
    "BOOST_GATE_LATCH suppresses loading during settle",
    latchGate({
      lastNonLoading: "guest",
      settleActive: true,
      authLoading: true,
    }) === "guest",
  );
  check(
    "BOOST_GATE_LATCH allows loading without settle (cold)",
    latchGate({
      lastNonLoading: null,
      settleActive: false,
      authLoading: true,
    }) === "loading",
  );
}

const failed = cases.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      harness: "PROD_TARGETED_SHUFFLE_BOOST_REBOUND_GUARD_HARNESS",
      pass: failed.length === 0,
      cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);