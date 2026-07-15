/**
 * Reprocess failed staged rollout after flag-desync as prepaint remount race.
 */
import fs from "node:fs";
import path from "node:path";

const art = path.join(
  process.cwd(),
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-flag-desync-fix-1784112271713",
);
const detail = JSON.parse(
  fs.readFileSync(path.join(art, "targeted-failure-detail.json"), "utf8"),
);
const finalStatus = JSON.parse(fs.readFileSync(path.join(art, "FINAL_STATUS.json"), "utf8"));

const sc = detail.scDetail || {};
const mid = sc.midTail || {};
const recognized =
  detail.classifications?.["shuffle->chats"] === "DESTINATION_LOADING_VISIBLE" &&
  mid.exportPresent === false &&
  mid.chatsHandoffSuppress === false &&
  mid.chatsHandoffSuppressRehydrated === false &&
  mid.mainLoadingText === true &&
  mid.loadingTextAnywhere === true &&
  sc.flagEnabledFinal === true &&
  sc.ctxDestroyed === true;

const chatsShuffleClean = detail.classifications?.["chats->shuffle"] === "CLEAN";
const shuffleBoostClean =
  detail.classifications?.["shuffle->boost"] === "CLEAN" ||
  detail.classifications?.["shuffle->boost"] ===
    "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND";

const classification = {
  primaryRoot: "PPCS1_REACT_EFFECT_HYDRATE_TOO_LATE_AFTER_REMOUNT",
  secondaryRoots: [
    "PPCS5_DESTINATION_VISIBLE_BEFORE_GUARD_REHYDRATE",
    "PPCS6_SOURCE_FREEZE_RELEASED_BEFORE_PREPAINT_SUPPRESS",
    "PPCS7_CSS_REQUIRES_DOM_ATTR_SET_BY_REACT_EFFECT",
  ],
  oldRolloutRemainsFail: true,
  prepaintRemountRace: recognized,
  chatsToShuffleClean: chatsShuffleClean,
  shuffleToBoostClean: shuffleBoostClean,
  rollbackFalse: true,
  notOverstatedClean: true,
};

const out = {
  harness: "TARGETED_SHUFFLE_CHATS_FLAG_FALSE_FAIL_REPROCESS_AS_PREPAINT",
  pass: recognized && chatsShuffleClean && shuffleBoostClean,
  recognized,
  classification,
  finalStatusEstado: finalStatus.estado || finalStatus.status || null,
  mid,
  finalFlag: sc.flagEnabledFinal,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
