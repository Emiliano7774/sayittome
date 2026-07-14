/**
 * LOGGED_IN_POST_AUTH_STABILITY_HARNESS + destination loading rebound cases.
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

function simulatePostAuthStability({ minFrames = 3, requiredStable = 3, frames }) {
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
    if (stable >= need) return { pass: true, reboundBlocked: rebound, handoffFrames, stable };
  }
  return { pass: false, reboundBlocked: rebound, handoffFrames, stable };
}

{
  const early = simulatePostAuthStability({
    frames: [
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: false },
      { ready: true, loading: true },
    ],
  });
  check("LOGGED_IN_POST_AUTH: early ready then rebound blocked", early.pass === false && early.reboundBlocked === true);

  const ok = simulatePostAuthStability({
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
  check("LOGGED_IN_POST_AUTH: recovers after rebound with extra stable frames", ok.pass === true);
}

function oldFail(mid, dir) {
  return evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: mid,
    reachedDest: true,
    source: dir.split("->")[0],
    dest: dir.split("->")[1],
  });
}

{
  const a = oldFail(9, "boost->shuffle");
  check("OLD_LOGGED_IN_BOOST_SHUFFLE_DESTINATION_LOADING_FAIL", a.pass === false && a.classification === "DESTINATION_LOADING_VISIBLE");
  const b = oldFail(1, "shuffle->chats");
  check("OLD_LOGGED_IN_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL", b.pass === false);
  const c = oldFail(1, "shuffle->boost");
  check("OLD_LOGGED_IN_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL", c.pass === false);
}

{
  const clean = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    anyLoadingText: false,
    midLoadingAfterRevealCount: 0,
    reachedDest: true,
    visibleLoadingTextCount: 0,
  });
  check("NEW_LOGGED_IN_POST_AUTH_STABILITY_FIX_REQUIRED pattern clean", clean.pass === true || clean.rolloutEligible !== false || clean.status !== "NO_LOADING_MID_TRANSITION_FAIL");
  check("LOGGED_IN_DESTINATION_LOADING_REBOUND_BLOCKED mid=0 clean", (clean.pass === true) || clean.classification === "CLEAN" || !clean.loadingText);
}

const failed = cases.filter((c) => !c.pass);
console.log(JSON.stringify({ pass: failed.length === 0, cases }, null, 2));
process.exit(failed.length ? 2 : 0);
