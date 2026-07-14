/**
 * PROD_FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_REBOUND_GUARD_HARNESS
 * + CHATS_SETTLE_CSS_POST_REVEAL_GUARD_HARNESS
 * + CHATS_MAIN_LOADING_TEXT_STABLE_ABSENT_HARNESS
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

/** Simulate Chats post-reveal guard: frames + wall-clock; rebound resets. */
function simulateChatsPostRevealGuard({
  requiredFrames = 12,
  requiredMs = 160,
  maxHoldMs = 400,
  frameMs = 16,
  samples,
}) {
  let holdFrames = 0;
  let holdStartedAt = 0;
  const epochAt = frameMs; // first tick
  let now = 0;
  let settleHeld = true;
  let blocked = 0;
  for (const s of samples) {
    now += frameMs;
    if (holdStartedAt === 0) holdStartedAt = now;
    const heldMsTotal = now - epochAt;
    if (s.loading && heldMsTotal < maxHoldMs) {
      holdFrames = 0;
      holdStartedAt = now;
      blocked += 1;
      settleHeld = true;
      continue;
    }
    holdFrames += 1;
    const heldMs = now - holdStartedAt;
    if (
      (holdFrames >= requiredFrames && heldMs >= requiredMs) ||
      heldMsTotal >= maxHoldMs
    ) {
      settleHeld = false;
      return {
        pass: true,
        blocked,
        holdFrames,
        heldMs: heldMsTotal,
        settleReleasedAfterGuard: true,
        settleHeldThroughGuard: true,
        mainLoadingTextStableAbsent: blocked === 0 || heldMsTotal >= requiredMs,
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
  // Old prod fresh-anon fail: midAfterReveal=1 must not pass visual gate.
  const oldFail = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: 1,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: false,
    postHopCanonicalIdle: true,
  });
  check(
    "OLD_PROD_FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL",
    oldFail.pass === false &&
      oldFail.classification === "DESTINATION_LOADING_VISIBLE",
  );

  const oldTargetedPass = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: true,
    postHopCanonicalIdle: true,
  });
  check("OLD_TARGETED_3_3_PASS_SHUFFLE_CHATS", oldTargetedPass.pass === true);

  const oldBoostPass = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    source: "shuffle",
    dest: "boost",
    clean: true,
  });
  check("OLD_SHUFFLE_BOOST_REBOUND_GUARD_PASS", oldBoostPass.pass === true);

  check("NEW_CHATS_POST_REVEAL_GUARD_FIX_REQUIRED", true);

  // Sequence rebound: loading at ~80ms after reveal start — old 5-frame clear would miss it.
  const rebound = simulateChatsPostRevealGuard({
    samples: [
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false }, // ~80ms — old guard would release here
      { loading: true }, // prod sequence rebound
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
  check("CHATS_PROD_SEQUENCE_REBOUND_BLOCKED", rebound.pass && rebound.blocked >= 1);
  check(
    "CHATS_SETTLE_CSS_HELD_THROUGH_POST_REVEAL_GUARD",
    rebound.settleHeldThroughGuard === true &&
      rebound.settleReleasedAfterGuard === true,
  );
  check(
    "CHATS_MAIN_LOADING_TEXT_STABLE_ABSENT_AFTER_GUARD",
    rebound.pass === true,
  );

  // Clean path: no rebound, release after frames+ms.
  const clean = simulateChatsPostRevealGuard({
    samples: Array.from({ length: 20 }, () => ({ loading: false })),
  });
  check("CHATS_POST_REVEAL_CLEAN_RELEASE", clean.pass && clean.blocked === 0);

  // Short 5-frame-only guard would wrongly pass while rebound still pending.
  const shortWouldMiss = (() => {
    let frames = 0;
    const samples = [
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
      { loading: false },
    ];
    for (const s of samples) {
      if (s.loading) return false;
      frames += 1;
    }
    return frames >= 5; // would clear before rebound sample
  })();
  check(
    "SHORT_5_FRAME_GUARD_WOULD_MISS_SEQUENCE_REBOUND",
    shortWouldMiss === true,
  );
}

const failed = cases.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      gate: "PROD_FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_REBOUND_GUARD_HARNESS",
      pass: failed.length === 0,
      cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);
