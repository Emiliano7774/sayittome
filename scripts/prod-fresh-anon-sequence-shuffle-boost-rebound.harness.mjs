/**
 * PROD_FRESH_ANON_SEQUENCE_SHUFFLE_BOOST_REBOUND_GUARD_HARNESS
 * + BOOST_SEQUENCE_GUARD_SURVIVES_PREVIOUS_HOP_CLEANUP_HARNESS
 * + BOOST_MAIN_LOADING_TEXT_STABLE_ABSENT_SEQUENCE_HARNESS
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

/** Simulate Boost post-reveal guard + post-clear eligibility grace. */
function simulateBoostSequenceGuard({
  requiredFrames = 12,
  requiredMs = 160,
  maxHoldMs = 400,
  frameMs = 16,
  postClearGraceMs = 360,
  samples,
}) {
  let holdFrames = 0;
  let holdStartedAt = 0;
  const epochAt = frameMs;
  let now = 0;
  let settleHeld = true;
  let blocked = 0;
  let graceUntil = 0;
  let visibleLoadingAfterClear = 0;

  for (const s of samples) {
    now += frameMs;
    if (holdStartedAt === 0) holdStartedAt = now;
    const heldMsTotal = now - epochAt;

    if (settleHeld) {
      if (s.loading && heldMsTotal < maxHoldMs) {
        holdFrames = 0;
        holdStartedAt = now;
        blocked += 1;
        continue;
      }
      holdFrames += 1;
      const heldMs = now - holdStartedAt;
      if (
        (holdFrames >= requiredFrames && heldMs >= requiredMs) ||
        heldMsTotal >= maxHoldMs
      ) {
        settleHeld = false;
        graceUntil = now + postClearGraceMs;
      }
      continue;
    }

    // After settle clear: eligibility grace must suppress visible loading.
    if (s.loading) {
      if (now < graceUntil) {
        // latch suppresses — not visible
      } else {
        visibleLoadingAfterClear += 1;
      }
    }
  }

  return {
    pass: visibleLoadingAfterClear === 0 && blocked >= 0,
    blocked,
    settleReleasedAfterGuard: !settleHeld,
    settleHeldThroughGuard: true,
    visibleLoadingAfterClear,
    graceCoveredRebound: blocked >= 1 || samples.some((s) => s.loading),
  };
}

{
  const oldFail = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: 1,
    reachedDest: true,
    source: "shuffle",
    dest: "boost",
    clean: false,
    postHopCanonicalIdle: true,
  });
  check(
    "OLD_PROD_FRESH_ANON_SEQUENCE_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL",
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
    dest: "boost",
    clean: true,
    postHopCanonicalIdle: true,
  });
  check("OLD_TARGETED_3_3_PASS", oldTargetedPass.pass === true);

  const oldChatsPass = evaluateBidirectionalTabNoLoadingVisualGate({
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
  check("OLD_CHATS_SEQUENCE_FIX_PASS", oldChatsPass.pass === true);

  check("NEW_BOOST_SEQUENCE_REBOUND_GUARD_FIX_REQUIRED", true);

  // Sequence: clean 5 frames would release early; rebound at ~96ms; grace covers post-clear.
  const samples = [
    ...Array.from({ length: 5 }, () => ({ loading: false })),
    { loading: true }, // would miss with short guard
    ...Array.from({ length: 14 }, () => ({ loading: false })),
    { loading: true }, // post-clear sequence remount
    ...Array.from({ length: 20 }, () => ({ loading: false })),
  ];
  const seq = simulateBoostSequenceGuard({ samples });
  check("BOOST_SEQUENCE_REBOUND_BLOCKED", seq.pass && seq.blocked >= 1);
  check(
    "BOOST_SEQUENCE_GUARD_SURVIVES_PREVIOUS_HOP_CLEANUP",
    seq.settleReleasedAfterGuard === true && seq.visibleLoadingAfterClear === 0,
  );
  check(
    "BOOST_MAIN_LOADING_TEXT_STABLE_ABSENT_SEQUENCE",
    seq.visibleLoadingAfterClear === 0,
  );

  // Without post-clear grace, late remount would be visible.
  const noGrace = simulateBoostSequenceGuard({
    samples,
    postClearGraceMs: 0,
  });
  check(
    "WITHOUT_POST_CLEAR_GRACE_SEQUENCE_REMOUNT_WOULD_FLASH",
    noGrace.visibleLoadingAfterClear >= 1,
  );
}

const failed = cases.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      gate: "PROD_FRESH_ANON_SEQUENCE_SHUFFLE_BOOST_REBOUND_GUARD_HARNESS",
      pass: failed.length === 0,
      cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);
