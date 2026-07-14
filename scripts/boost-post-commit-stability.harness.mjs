/**
 * BOOST_POST_COMMIT_STABILITY_HARNESS + BOOST_SEQUENCE_REENTRY_NO_LOADING_HARNESS
 * Unit-level regressions for sequential Shuffle→Boost post-reveal loading fix.
 */
import assert from "node:assert/strict";
import {
  evaluateBidirectionalTabNoLoadingVisualGate,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  if (!cond) console.error("FAIL", name);
  else console.log("PASS", name);
}

// Simulate post-commit stability: ready before commit is insufficient if loading rebounds.
function simulateBoostPostCommitStability({
  minFrames = 3,
  requiredStable = 3,
  frames,
}) {
  let handoffFrames = 0;
  let stable = 0;
  let sawReady = false;
  let rebound = false;
  for (const f of frames) {
    handoffFrames += 1;
    if (f.loading) {
      if (sawReady) rebound = true;
      stable = 0;
      continue;
    }
    if (!f.ready) {
      stable = 0;
      continue;
    }
    if (handoffFrames < minFrames) continue;
    sawReady = true;
    stable += 1;
    const need = rebound ? requiredStable + 2 : requiredStable;
    if (stable >= need) {
      return { pass: true, reboundBlocked: rebound, handoffFrames, stable };
    }
  }
  return { pass: false, reboundBlocked: rebound, handoffFrames, stable };
}

{
  const earlyReady = simulateBoostPostCommitStability({
    frames: [
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: true }, // rebound after false ready window
    ],
  });
  check(
    "BOOST_POST_COMMIT: early ready then loading rebound does not pass yet",
    earlyReady.pass === false && earlyReady.reboundBlocked === true,
  );

  const stableAfterRebound = simulateBoostPostCommitStability({
    frames: [
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: true },
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: false },
    ],
  });
  check(
    "BOOST_POST_COMMIT: requires extra stable frames after rebound",
    stableAfterRebound.pass === true,
  );

  const minFramesGate = simulateBoostPostCommitStability({
    frames: [
      { ready: true, loading: false },
      { ready: true, loading: false },
    ],
  });
  check(
    "BOOST_POST_COMMIT: min frames after handoff required",
    minFramesGate.pass === false,
  );
}

{
  // Targeted isolated may pass; sequence midLoadingAfterReveal must fail gate.
  const oldFail = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: 1,
    reachedDest: true,
    clean: false,
  });
  check(
    "SEQUENCE_REENTRY: post-reveal loading cannot pass visual gate",
    oldFail.pass === false,
  );

  const sequenceClean = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    clean: true,
    postHopCanonicalIdle: true,
  });
  check(
    "SEQUENCE_REENTRY: clean sequence hop can pass",
    sequenceClean.pass === true,
  );

  check(
    "SEQUENCE_REENTRY: targeted pass insufficient when midLoadingAfterReveal>0",
    !(oldFail.pass === true && oldFail.rolloutEligible === true),
  );
}

{
  // Soft settle must not classify boost loading as clean.
  function boostSoftSettleAllowed(path, visual) {
    if (path === "/boost") return false;
    return (
      !visual.hasLoadingShell &&
      !visual.hasVisibleLoadingText &&
      visual.hasContentRoot &&
      visual.geometryValid
    );
  }
  check(
    "NO_BOOST_SOFT_SETTLE: boost blocked",
    boostSoftSettleAllowed("/boost", {
      hasLoadingShell: false,
      hasVisibleLoadingText: false,
      hasContentRoot: true,
      geometryValid: true,
    }) === false,
  );
  check(
    "NO_BOOST_SOFT_SETTLE: chats still allowed",
    boostSoftSettleAllowed("/chats", {
      hasLoadingShell: false,
      hasVisibleLoadingText: false,
      hasContentRoot: true,
      geometryValid: true,
    }) === true,
  );
}

const failed = cases.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      harness: "BOOST_POST_COMMIT_STABILITY_HARNESS",
      pass: failed.length === 0,
      cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);
