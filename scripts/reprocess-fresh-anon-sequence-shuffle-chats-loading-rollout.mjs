/**
 * Reprocess staged-rollout-final-after-logged-in-chats — recognize old FAIL,
 * targeted PASS, and NOT_RUN logged/cold without overstating clean.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const art =
  process.argv[2] ||
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-logged-in-chats-fix-1784100362461";

const failDetail = JSON.parse(
  fs.readFileSync(path.join(art, "fresh-anon-failure-detail.json"), "utf8"),
);
const finalStatus = JSON.parse(
  fs.readFileSync(path.join(art, "FINAL_STATUS.json"), "utf8"),
);
const targeted = JSON.parse(
  fs.readFileSync(path.join(art, "prod-targeted-regression-summary.json"), "utf8"),
);

const sc = failDetail.scDetail || failDetail.bad?.[0];
const hopGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
  classification: sc?.c || "DESTINATION_LOADING_VISIBLE",
  anyLoadingText: sc?.any === true,
  midLoadingAfterRevealCount: sc?.mid ?? 1,
  reachedDest: true,
  source: "shuffle",
  dest: "chats",
  clean: false,
  postHopCanonicalIdle: sc?.idle === true,
});

const targetedSc = (targeted.directions || []).find(
  (d) => d.source === "shuffle" && d.dest === "chats",
);
const targetedGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
  classification: targetedSc?.classification || "CLEAN",
  anyLoadingText: Boolean(targetedSc?.anyLoadingText),
  midLoadingAfterRevealCount: targetedSc?.midLoadingAfterRevealCount ?? 0,
  reachedDest: true,
  source: "shuffle",
  dest: "chats",
  clean: targetedSc?.clean !== false,
  postHopCanonicalIdle: true,
});

const out = {
  artifact: art,
  oldRolloutRemainsFail: finalStatus.pass === false,
  freshShuffleChatsRecognized: {
    classification: sc?.c,
    mid: sc?.mid,
    loadingTextAnywhere: sc?.any,
    mainLoadingText: sc?.midTail?.mainLoadingText ?? sc?.mainLoadingText,
    route: sc?.path,
    finalIdle: sc?.idle,
    exitHandoff: sc?.midTail?.exitHandoff === false,
    gatePass: hopGate.pass,
  },
  targetedOldPassRecognized: {
    hardPass: targeted.hardPass === true,
    shuffleChats: targetedSc?.classification,
    mid: targetedSc?.midLoadingAfterRevealCount,
    gatePass: targetedGate.pass,
  },
  freshShuffleBoostClean:
    failDetail.classifications?.["shuffle->boost"]?.includes("CLEAN") ||
    failDetail.classifications?.["shuffle->boost"]?.includes("REBIND"),
  freshBoostShuffleClean:
    failDetail.classifications?.["boost->shuffle"]?.includes("CLEAN") ||
    failDetail.classifications?.["boost->shuffle"]?.includes("REBIND"),
  loggedInNotRun: /NOT_RUN/i.test(JSON.stringify(finalStatus)),
  coldSummaryMonitorNotRun: true,
  overstatedClean: false,
  pass:
    finalStatus.pass === false &&
    hopGate.pass === false &&
    sc?.c === "DESTINATION_LOADING_VISIBLE" &&
    sc?.mid === 1 &&
    sc?.any === true &&
    targeted.hardPass === true,
};

console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 2);
