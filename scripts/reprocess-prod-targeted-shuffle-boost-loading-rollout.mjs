/**
 * Reprocess staged-rollout-logged-in-final-no-loading-1784026207867
 * Expect: old FAIL recognized; not overstated clean.
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
  "scripts/ghost-filmstrip-out/staged-rollout-logged-in-final-no-loading-1784026207867",
);
const outArg = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

function load(name) {
  return JSON.parse(
    fs.readFileSync(path.join(prev, name), "utf8").replace(/^\uFEFF/, ""),
  );
}

const chats = load("prod-targeted-hop-chats-shuffle.json");
const sch = load("prod-targeted-hop-shuffle-chats.json");
const boost = load("prod-targeted-hop-shuffle-boost.json");
const report = load("REQUIRED_REPORT.json");

const boostGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: boost.visualProvider,
  classification: boost.classification,
  anyLoadingText: boost.anyLoadingText,
  midLoadingAfterRevealCount: boost.midLoadingAfterRevealCount,
  reachedDest: boost.reachedDest,
  source: "shuffle",
  dest: "boost",
  clean: boost.clean,
});

const result = {
  artifact: prev,
  OLD_PROD_TARGETED_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL:
    boost.classification === "DESTINATION_LOADING_VISIBLE" &&
    boost.midLoadingAfterRevealCount === 1 &&
    boostGate.pass === false,
  OLD_TARGETED_CHATS_SHUFFLE_PASS: chats.classification === "CLEAN" && chats.clean === true,
  OLD_TARGETED_SHUFFLE_CHATS_CLEAN_WITH_REBIND_PASS:
    String(sch.classification).includes("CLEAN") && sch.clean === true,
  freshAnonNotRun: report.freshAnon === "NOT_RUN",
  loggedInNotRun: report.loggedIn === "NOT_RUN",
  notOverstatedClean: report.estado?.includes("FAILED") === true,
  midLoadingAfterRevealCount: boost.midLoadingAfterRevealCount,
  boostClassification: boost.classification,
  NEW_BOOST_POST_REVEAL_GUARD_FIX_REQUIRED: true,
};

result.pass =
  result.OLD_PROD_TARGETED_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL &&
  result.OLD_TARGETED_CHATS_SHUFFLE_PASS &&
  result.OLD_TARGETED_SHUFFLE_CHATS_CLEAN_WITH_REBIND_PASS &&
  result.freshAnonNotRun &&
  result.loggedInNotRun &&
  result.notOverstatedClean;

if (outArg) {
  fs.mkdirSync(path.dirname(outArg), { recursive: true });
  fs.writeFileSync(outArg, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 2);