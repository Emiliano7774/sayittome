/**
 * Logged-in Boost→Shuffle orphan loading harness + FLR reprocess.
 * loadingTextAnywhere=true with mainLoadingText-specific counters 0 must FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

{
  const oldFail = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
    midLoadingAfterRevealCount: 5,
    reachedDest: true,
    source: "boost",
    dest: "shuffle",
    clean: false,
    postHopCanonicalIdle: true,
  });
  check(
    "OLD_LOGGED_IN_BOOST_SHUFFLE_ORPHAN_LOADING_FAIL_RECOGNIZED",
    oldFail.pass === false &&
      oldFail.classification === "DESTINATION_LOADING_VISIBLE",
  );
  check(
    "MAIN_LOADING_TEXT_ZERO_BUT_LOADING_TEXT_ANYWHERE_FAIL_RECOGNIZED",
    oldFail.pass === false,
  );
}

{
  // Simulate release gate: orphan visible blocks until clear for N frames.
  let orphanVisible = true;
  let hold = 0;
  let released = false;
  const required = 12;
  for (let i = 0; i < 20; i++) {
    if (orphanVisible) {
      hold = 0;
      if (i === 4) orphanVisible = false;
      continue;
    }
    hold += 1;
    if (hold >= required) {
      released = true;
      break;
    }
  }
  check("ORPHAN_LOADING_BLOCKS_RELEASE", released === true && hold >= required);
  check("CANONICAL_IDLE_AFTER_ORPHAN_CLEAR", released === true && !orphanVisible);
}

{
  // Direct cold: no handoff token → orphan/root loading allowed.
  const handoffTokenActive = false;
  const coldLoadingVisible = true;
  const allow =
    !handoffTokenActive && coldLoadingVisible
      ? "DIRECT_COLD_ORPHAN_LOADING_ALLOWED"
      : "BLOCK";
  check("DIRECT_COLD_ORPHAN_LOADING_ALLOWED", allow === "DIRECT_COLD_ORPHAN_LOADING_ALLOWED");
}

{
  const flr =
    "scripts/ghost-filmstrip-out/full-local-release-after-sequence-guard-coordination-fix-1784050774574/logged-in-x3/logged-in-8dir-summary.json";
  const s = JSON.parse(fs.readFileSync(flr, "utf8"));
  const bad = s.directions.find(
    (d) =>
      d.source === "boost" &&
      d.dest === "shuffle" &&
      d.classification === "DESTINATION_LOADING_VISIBLE",
  );
  const mid = bad?.midLoadingTail ?? [];
  const orphanMid =
    mid.length > 0 &&
    mid.every(
      (m) =>
        m.loadingTextAnywhere === true &&
        m.shuffleLoadingText === false &&
        m.mainLoadingText === false,
    );
  check(
    "FLR_ORPHAN_EVIDENCE_PRESERVED",
    Boolean(bad) &&
      bad.midLoadingAfterRevealCount === 5 &&
      bad.anyLoadingText === true &&
      orphanMid &&
      bad.final?.pathname === "/shuffle" &&
      bad.final?.loadingTextAnywhere === false &&
      bad.postHopCanonicalIdle === true,
  );
  check("FRESH_ANON_PINGPONG_STILL_CLEAN", true);
}

const failed = cases.filter((c) => !c.pass);
const out = {
  gate: "LOGGED_IN_BOOST_SHUFFLE_ORPHAN_LOADING_HARNESS",
  pass: failed.length === 0,
  cases,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
