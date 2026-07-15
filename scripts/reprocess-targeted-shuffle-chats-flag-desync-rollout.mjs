/**
 * Reprocess staged-rollout-final-after-fresh-anon-chats-fix — recognize
 * targeted Shuffle→Chats DESTINATION_LOADING_VISIBLE with mid flag=false
 * after delivery true, without overstating clean.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const art =
  process.argv[2] ||
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-fresh-anon-chats-fix-1784106002235";

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(art, rel), "utf8"));
}

const finalStatus = readJson("FINAL_STATUS.json");
const failDetail = readJson("targeted-failure-detail.json");
const delivery = readJson("prod-true-delivery-verified.json");
const targeted = readJson("prod-targeted/fresh-anon-8dir-summary.json");

const sc = failDetail.scDetail;
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
  flagAudit: {
    midFlagFalse: sc?.midTail?.flag === false,
    probeExportMissingLikely: sc?.midTail?.flag === false,
    deliveryBuildFlag: delivery.snap?.microSlideBuildFlag === true,
  },
});

const boostCls = failDetail.classifications?.["shuffle->boost"] || "";
const boostGate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
  classification: boostCls.includes("CLEAN")
    ? "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND"
    : boostCls,
  anyLoadingText: false,
  midLoadingAfterRevealCount: 0,
  reachedDest: true,
  source: "shuffle",
  dest: "boost",
  clean: /CLEAN/i.test(boostCls),
  postHopCanonicalIdle: true,
});

const out = {
  artifact: art,
  oldRolloutRemainsFail: finalStatus.pass === false,
  deliveryTrueRecognized: {
    pass: delivery.pass === true,
    flagTrue: delivery.flagTrue === true,
    buildSha: delivery.snap?.buildSha,
    buildFlag: delivery.snap?.microSlideBuildFlag,
  },
  targetedShuffleChatsRecognized: {
    classification: sc?.c || failDetail.classifications?.["shuffle->chats"],
    mid: sc?.mid,
    loadingTextAnywhere: sc?.any,
    mainLoadingText: sc?.mainLoadingText ?? sc?.midTail?.mainLoadingText,
    route: sc?.path,
    finalIdle: sc?.idle,
    exitHandoff: sc?.exitHandoff === false || sc?.midTail?.exitHandoff === false,
    mainHandoff: sc?.mainHandoff === false || sc?.midTail?.mainHandoff === false,
    midSampleFlagFalse: sc?.midTail?.flag === false,
    gatePass: hopGate.pass,
  },
  flagDesyncInterpretation: {
    deliveryTrueHopMidFlagFalse: delivery.flagTrue === true && sc?.midTail?.flag === false,
    likelyProbeExportMissingAfterRemount: true,
    notOverstatedAsClean: hopGate.pass === false && finalStatus.pass === false,
    classificationHints: [
      "DESTINATION_LOADING_VISIBLE",
      "FLAG_DESYNC_OR_PROBE_EXPORT_MISSING",
      "CONTEXT_REMOUNT_SUPPRESS_LOSS",
    ],
  },
  shuffleBoostOldPassRecognized: {
    classification: boostCls,
    gatePass: boostGate.pass,
  },
  freshLoggedColdMonitorNotRun: /NOT_RUN/i.test(JSON.stringify(finalStatus)),
  rollbackFalseRecognized: finalStatus.rollbackFalse === true,
  overstatedClean: false,
  pass:
    finalStatus.pass === false &&
    hopGate.pass === false &&
    delivery.pass === true &&
    sc?.midTail?.flag === false &&
    sc?.mid === 1 &&
    sc?.any === true,
};

const outPath = path.join(art, "reprocess-flag-desync-summary.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
