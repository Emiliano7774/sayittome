/**
 * Reprocess staged-rollout-final-after-boost-rebound-fix-1784031407689
 * Expect: old fresh-anon FAIL recognized; targeted 3/3 PASS; not overstated clean.
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
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-boost-rebound-fix-1784031407689",
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
const hop = load("fresh-anon-prod-hop-shuffle-chats.json");
const targetedSch = load("prod-targeted-hop-shuffle-chats.json");
const targetedBoost = load("prod-targeted-hop-shuffle-boost.json");
const report = load("REQUIRED_REPORT.json");

const hopGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: hop.visualProvider,
  classification: hop.classification,
  anyLoadingText: hop.anyLoadingText,
  midLoadingAfterRevealCount: hop.midLoadingAfterRevealCount,
  reachedDest: hop.reachedDest,
  source: "shuffle",
  dest: "chats",
  clean: hop.clean,
  postHopCanonicalIdle: hop.postHopCanonicalIdle,
});

const result = {
  artifact: prev,
  OLD_PROD_FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL:
    hop.classification === "DESTINATION_LOADING_VISIBLE" &&
    hop.midLoadingAfterRevealCount === 1 &&
    hopGate.pass === false &&
    hop.reachedDest === true &&
    hop.postHopCanonicalIdle === true,
  OLD_TARGETED_3_3_PASS: targeted.hardPass === true || targeted.series?.pass === true,
  OLD_TARGETED_SHUFFLE_CHATS_CLEAN_WITH_REBIND:
    String(targetedSch.classification).includes("CLEAN") &&
    targetedSch.midLoadingAfterRevealCount === 0,
  OLD_SHUFFLE_BOOST_REBOUND_GUARD_PASS:
    String(targetedBoost.classification).includes("CLEAN") &&
    targetedBoost.midLoadingAfterRevealCount === 0,
  OLD_FRESH_ANON_FAIL: fresh.hardPass === false,
  OLD_LOGGED_IN_NOT_RUN: true,
  OLD_COLD_NOT_RUN: true,
  OLD_MONITOR_NOT_RUN: true,
  notOverstatedClean:
    String(report["93_estado"] || report.estado || "").includes("FAILED") === true,
  midLoadingAfterRevealCount: hop.midLoadingAfterRevealCount,
  hopClassification: hop.classification,
  finalPath: hop.final?.pathname,
  NEW_CHATS_POST_REVEAL_GUARD_FIX_REQUIRED: true,
  CHATS_PROD_SEQUENCE_REBOUND_BLOCKED: true,
};

result.pass =
  result.OLD_PROD_FRESH_ANON_SEQUENCE_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL &&
  result.OLD_TARGETED_3_3_PASS &&
  result.OLD_TARGETED_SHUFFLE_CHATS_CLEAN_WITH_REBIND &&
  result.OLD_SHUFFLE_BOOST_REBOUND_GUARD_PASS &&
  result.OLD_FRESH_ANON_FAIL &&
  result.notOverstatedClean;

if (outArg) {
  fs.mkdirSync(path.dirname(outArg), { recursive: true });
  fs.writeFileSync(outArg, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 2);
