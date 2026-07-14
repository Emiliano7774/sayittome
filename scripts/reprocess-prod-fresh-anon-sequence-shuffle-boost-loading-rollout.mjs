/**
 * Reprocess staged-rollout-final-after-chats-rebound-fix-1784040031197
 * Expect: old fresh-anon Shuffle→Boost FAIL; targeted 3/3 PASS; Chats PASS; not overstated clean.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  evaluateBidirectionalTabNoLoadingVisualGate,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const prev = path.join(
  root,
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-chats-rebound-fix-1784040031197",
);
const outArg = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

function load(name) {
  return JSON.parse(
    fs.readFileSync(path.join(prev, name), "utf8").replace(/^\uFEFF/, ""),
  );
}

const targeted = load("prod-targeted-regression-summary.json");
const fresh = load("fresh-anon-exact-sequence-prod-8dir-summary.json");
const hopBoost = load("fresh-anon-prod-hop-shuffle-boost.json");
const hopChats = load("fresh-anon-prod-hop-shuffle-chats.json");
const targetedBoost = load("prod-targeted-hop-shuffle-boost.json");
const report = load("REQUIRED_REPORT.json");

const failGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: hopBoost.visualProvider,
  classification: hopBoost.classification,
  anyLoadingText: hopBoost.anyLoadingText,
  midLoadingAfterRevealCount: hopBoost.midLoadingAfterRevealCount,
  reachedDest: hopBoost.reachedDest,
  source: "shuffle",
  dest: "boost",
  clean: hopBoost.clean,
  postHopCanonicalIdle: hopBoost.postHopCanonicalIdle,
});

const chatsGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: hopChats.visualProvider,
  classification: hopChats.classification,
  anyLoadingText: hopChats.anyLoadingText,
  midLoadingAfterRevealCount: hopChats.midLoadingAfterRevealCount,
  reachedDest: hopChats.reachedDest,
  source: "shuffle",
  dest: "chats",
  clean: hopChats.clean,
  postHopCanonicalIdle: hopChats.postHopCanonicalIdle,
});

const targetedGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: targetedBoost.visualProvider,
  classification: targetedBoost.classification,
  anyLoadingText: targetedBoost.anyLoadingText,
  midLoadingAfterRevealCount: targetedBoost.midLoadingAfterRevealCount,
  reachedDest: targetedBoost.reachedDest,
  source: "shuffle",
  dest: "boost",
  clean: targetedBoost.clean,
});

const out = {
  artifact: prev,
  OLD_PROD_FRESH_ANON_SEQUENCE_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL:
    failGate.pass === false &&
    hopBoost.classification === "DESTINATION_LOADING_VISIBLE" &&
    hopBoost.midLoadingAfterRevealCount === 1,
  OLD_TARGETED_3_3_PASS: targeted.hardPass === true || targeted.seriesPass === true,
  OLD_TARGETED_SHUFFLE_BOOST_CLEAN: targetedGate.pass === true,
  OLD_CHATS_SEQUENCE_FIX_PASS:
    chatsGate.pass === true && (hopChats.midLoadingAfterRevealCount || 0) === 0,
  OLD_FRESH_ANON_FAIL: fresh.hardPass === false || fresh.seriesPass === false,
  OLD_LOGGED_IN_NOT_RUN: report["43_loggedInProvider"] === "NOT_RUN",
  OLD_COLD_NOT_RUN: String(report["68_72_directCold"] || "").includes("NOT_RUN"),
  OLD_MONITOR_NOT_RUN: report["75_monitorResult"] === "NOT_RUN",
  notOverstatedClean: report["93_estado"]?.includes("FAILED") === true,
  midLoadingAfterRevealCount: hopBoost.midLoadingAfterRevealCount,
  hopClassification: hopBoost.classification,
  finalPath: hopBoost.final?.pathname || "/boost",
  NEW_BOOST_SEQUENCE_REBOUND_GUARD_FIX_REQUIRED: true,
  BOOST_SEQUENCE_REBOUND_BLOCKED: true,
  pass: false,
};

out.pass =
  out.OLD_PROD_FRESH_ANON_SEQUENCE_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL &&
  out.OLD_TARGETED_3_3_PASS &&
  out.OLD_CHATS_SEQUENCE_FIX_PASS &&
  out.notOverstatedClean &&
  out.NEW_BOOST_SEQUENCE_REBOUND_GUARD_FIX_REQUIRED;

const text = JSON.stringify(out, null, 2);
console.log(text);
if (outArg) {
  fs.mkdirSync(path.dirname(outArg), { recursive: true });
  fs.writeFileSync(outArg, text);
}
process.exit(out.pass ? 0 : 2);
