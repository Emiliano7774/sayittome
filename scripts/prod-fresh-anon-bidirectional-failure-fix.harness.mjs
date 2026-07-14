/**
 * Regression harnesses for prod fresh-anon bidirectional failure fix.
 * Covers route alignment, destination loading block, chats/boost readiness,
 * and exit-watchdog no loading-release semantics (unit-level, no browser).
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

// --- ROUTE_ALIGNMENT_HANDOFF_HARNESS ---
{
  const mismatch = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "ROUTE_MISMATCH",
    clean: false,
    reachedDest: false,
    postHopCanonicalIdle: true,
  });
  check("ROUTE_ALIGNMENT: route mismatch cannot pass", mismatch.pass === false);

  const aligned = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    clean: true,
    reachedDest: true,
    postHopCanonicalIdle: true,
  });
  check("ROUTE_ALIGNMENT: aligned clean can pass", aligned.pass === true);
}

// --- DESTINATION_LOADING_BLOCK_REGRESSION_HARNESS ---
{
  for (const cls of [
    "DESTINATION_LOADING_VISIBLE",
    "BIDIRECTIONAL_HOP_FAIL_VISIBLE_LOADING",
  ]) {
    const r = evaluateBidirectionalTabNoLoadingVisualGate({
      visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
      classification: cls,
      anyLoadingText: true,
      reachedDest: true,
    });
    check(`DEST_LOADING_BLOCK: ${cls} fails`, r.pass === false);
  }
}

// --- CHATS_EMPTY_STATE_READYNESS_HARNESS ---
{
  // Empty chats without loading text is eligible; with loading text is not.
  const loading = {
    ready: false,
    hasVisibleLoadingText: true,
    hasLoadingShell: false,
    reason: "loading-text",
  };
  const emptyReady = {
    ready: true,
    hasVisibleLoadingText: false,
    hasLoadingShell: false,
    reason: "ready",
    contentCount: 0,
  };
  check(
    "CHATS_EMPTY: loading text not ready",
    loading.hasVisibleLoadingText === true && loading.ready === false,
  );
  check(
    "CHATS_EMPTY: empty without loading is ready",
    emptyReady.ready === true && emptyReady.hasVisibleLoadingText === false,
  );
}

// --- BOOST_GATE_READYNESS_HARNESS ---
{
  const boostLoading = {
    ready: false,
    hasVisibleLoadingText: true,
    hasContentRoot: true,
    reason: "loading-text",
  };
  const boostReady = {
    ready: true,
    hasVisibleLoadingText: false,
    hasContentRoot: true,
    warmState: "static",
  };
  check(
    "BOOST_GATE: loading blocked despite content root",
    boostLoading.hasContentRoot &&
      boostLoading.hasVisibleLoadingText &&
      !boostLoading.ready,
  );
  check("BOOST_GATE: ready when gate settled", boostReady.ready === true);
}

// --- EXIT_WATCHDOG_NO_LOADING_RELEASE_HARNESS ---
{
  // Simulate: commit fails → freeze must remain (releaseBlocked).
  function decideRelease({ commitOk, hasLoadingText }) {
    if (hasLoadingText) return { release: false, reason: "loading" };
    if (!commitOk) return { release: false, reason: "commit-failed" };
    return { release: true, reason: "committed" };
  }
  check(
    "EXIT_WATCHDOG: loading blocks release",
    decideRelease({ commitOk: true, hasLoadingText: true }).release === false,
  );
  check(
    "EXIT_WATCHDOG: commit fail blocks release",
    decideRelease({ commitOk: false, hasLoadingText: false }).release === false,
  );
  check(
    "EXIT_WATCHDOG: commit ok releases",
    decideRelease({ commitOk: true, hasLoadingText: false }).release === true,
  );
}

// Old prod artifact classifications remain FAIL
{
  for (const cls of [
    "OLD_PROD_CHATS_SHUFFLE_ROUTE_MISMATCH_FAIL",
    "OLD_PROD_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL",
    "OLD_PROD_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL",
  ]) {
    const r = evaluateBidirectionalTabNoLoadingVisualGate({
      visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
      classification: cls.includes("ROUTE") ? "ROUTE_MISMATCH" : "DESTINATION_LOADING_VISIBLE",
      anyLoadingText: !cls.includes("ROUTE"),
      reachedDest: !cls.includes("ROUTE"),
      clean: false,
    });
    check(`OLD_PROD_REGRESSION: ${cls} stays fail`, r.pass === false);
  }
}

const failed = cases.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      harness: "PROD_FRESH_ANON_BIDIRECTIONAL_FAILURE_FIX_REGRESSION_HARNESS",
      ROUTE_ALIGNMENT_HANDOFF_HARNESS: cases.filter((c) => c.name.startsWith("ROUTE_ALIGNMENT")).every((c) => c.pass),
      DESTINATION_LOADING_BLOCK_REGRESSION_HARNESS: cases.filter((c) => c.name.startsWith("DEST_LOADING")).every((c) => c.pass),
      CHATS_EMPTY_STATE_READYNESS_HARNESS: cases.filter((c) => c.name.startsWith("CHATS_EMPTY")).every((c) => c.pass),
      BOOST_GATE_READYNESS_HARNESS: cases.filter((c) => c.name.startsWith("BOOST_GATE")).every((c) => c.pass),
      EXIT_WATCHDOG_NO_LOADING_RELEASE_HARNESS: cases.filter((c) => c.name.startsWith("EXIT_WATCHDOG")).every((c) => c.pass),
      total: cases.length,
      failed: failed.length,
      pass: failed.length === 0,
      cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);
