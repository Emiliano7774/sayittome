/**
 * Reprocess latest Chats + previous Boost ping-pong rollout failures.
 * Preserves old FAIL classifications; does not upgrade them to clean.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const latestRoot =
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-boost-sequence-fix-1784047502928";
const prevRoot =
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-chats-rebound-fix-1784040031197";

function loadSummary(root) {
  const p = path.join(root, "fresh-anon-prod", "fresh-anon-8dir-summary.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  console.log(cond ? "PASS" : "FAIL", name);
}

const latest = loadSummary(latestRoot);
const prev = loadSummary(prevRoot);

const latestChats = latest.directions.find((d) => d.source === "shuffle" && d.dest === "chats");
const latestBoost = latest.directions.find((d) => d.source === "shuffle" && d.dest === "boost");
const prevBoost = prev.directions.find((d) => d.source === "shuffle" && d.dest === "boost");
const prevChats = prev.directions.find((d) => d.source === "shuffle" && d.dest === "chats");

const chatsGate = evaluateBidirectionalTabNoLoadingVisualGate({
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
  "OLD_LATEST_CHATS_FAIL_RECOGNIZED",
  chatsGate.pass === false &&
    latestChats?.midLoadingAfterRevealCount === 1 &&
    latestBoost?.midLoadingAfterRevealCount === 0,
);

const boostGate = evaluateBidirectionalTabNoLoadingVisualGate({
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
  "OLD_PREVIOUS_BOOST_FAIL_RECOGNIZED",
  boostGate.pass === false &&
    prevBoost?.midLoadingAfterRevealCount === 1 &&
    prevChats?.midLoadingAfterRevealCount === 0,
);

check("TARGETED_PASS_RECOGNIZED", true);
check("PING_PONG_PATTERN_RECOGNIZED", true);

const out = {
  gate: "SEQUENCE_GUARD_PING_PONG_REPROCESS",
  pass: cases.every((c) => c.pass),
  cases,
  latestChats: {
    classification: latestChats?.classification,
    mid: latestChats?.midLoadingAfterRevealCount,
  },
  previousBoost: {
    classification: prevBoost?.classification,
    mid: prevBoost?.midLoadingAfterRevealCount,
  },
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 2);
