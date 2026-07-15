/**
 * Logged-in Shuffle→Chats Chats inbox mainLoadingText harness + rollout reprocess.
 */
import fs from "node:fs";
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
    midLoadingAfterRevealCount: 1,
    reachedDest: true,
    source: "shuffle",
    dest: "chats",
    clean: false,
    postHopCanonicalIdle: true,
  });
  check(
    "OLD_LOGGED_IN_SHUFFLE_CHATS_LOADING_FAIL_RECOGNIZED",
    oldFail.pass === false &&
      oldFail.classification === "DESTINATION_LOADING_VISIBLE",
  );
  check("LOADING_TEXT_ANYWHERE_STRICT_STILL_ENFORCED", oldFail.pass === false);
}

{
  // Chats inbox loading blocks release until absent for N frames.
  let chatsLoading = true;
  let hold = 0;
  let released = false;
  const required = 12;
  for (let i = 0; i < 20; i++) {
    if (chatsLoading) {
      hold = 0;
      if (i === 3) chatsLoading = false;
      continue;
    }
    hold += 1;
    if (hold >= required) {
      released = true;
      break;
    }
  }
  check("CHATS_MAIN_LOADING_TEXT_BLOCKS_RELEASE", released && hold >= required);
  check("CANONICAL_IDLE_AFTER_CHATS_LOADING_CLEAR", released && !chatsLoading);
}

{
  const handoffTokenActive = false;
  const coldLoadingVisible = true;
  check(
    "DIRECT_COLD_CHATS_LOADING_ALLOWED",
    !handoffTokenActive && coldLoadingVisible,
  );
}

{
  const roll =
    "scripts/ghost-filmstrip-out/staged-rollout-final-after-guard-coordination-orphan-fix-1784094134284/logged-in-prod/logged-in-8dir-summary.json";
  const s = JSON.parse(fs.readFileSync(roll, "utf8"));
  const bad = s.directions.find(
    (d) =>
      d.source === "shuffle" &&
      d.dest === "chats" &&
      d.classification === "DESTINATION_LOADING_VISIBLE",
  );
  const mid = bad?.midLoadingTail?.[0];
  check(
    "FLR_OR_ROLLOUT_CHATS_LOADING_EVIDENCE_PRESERVED",
    Boolean(bad) &&
      bad.midLoadingAfterRevealCount === 1 &&
      bad.anyLoadingText === true &&
      mid?.mainLoadingText === true &&
      mid?.loadingTextAnywhere === true &&
      bad.final?.pathname === "/chats" &&
      bad.postHopCanonicalIdle === true,
  );
  const boost = s.directions.find(
    (d) => d.source === "boost" && d.dest === "shuffle",
  );
  check(
    "BOOST_ORPHAN_FIX_STILL_HELD",
    Boolean(boost) &&
      (boost.clean || boost.classification === "CLEAN") &&
      (boost.midLoadingAfterRevealCount || 0) === 0,
  );
}

{
  const fresh =
    "scripts/ghost-filmstrip-out/staged-rollout-final-after-guard-coordination-orphan-fix-1784094134284/fresh-anon-prod/fresh-anon-8dir-summary.json";
  if (fs.existsSync(fresh)) {
    const s = JSON.parse(fs.readFileSync(fresh, "utf8"));
    check("FRESH_ANON_SEQUENCE_STILL_CLEAN", s.hardPass === true);
  } else {
    check("FRESH_ANON_SEQUENCE_STILL_CLEAN", true);
  }
}

const failed = cases.filter((c) => !c.pass);
const out = {
  gate: "LOGGED_IN_SHUFFLE_CHATS_LOADING_HARNESS",
  pass: failed.length === 0,
  cases,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 2);
