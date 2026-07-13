/**
 * Offline reprocess of staged rollout smoke series arm-divergence artifact.
 * No production access. Tooling forensic only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveLiveTransactionActive,
  refreshOuterArmContextForHop,
  armProdTrueInputWithContext,
  buildProdTrueArmContext,
} from "./prod-true-arm-context.mjs";
import { evaluateProdTrueInputArm } from "./prod-true-fail-closed-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREV =
  process.argv[2] ||
  path.join(
    __dirname,
    "ghost-filmstrip-out/staged-permanent-rollout-waapi-shuffle-1783929630011",
  );
const OUT =
  process.argv[3] ||
  path.join(
    __dirname,
    "ghost-filmstrip-out/staged-rollout-smoke-series-arm-divergence-forensic-1783930854951",
  );

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const chats = readJson(path.join(PREV, "smoke-capture/hop-01-chats/hop-report.json"));
const settings = readJson(path.join(PREV, "smoke-capture/hop-02-settings/hop-report.json"));
const outerRaw = readJson(path.join(PREV, "smoke-capture/hop-02-settings/outer-arm-context.json"));
const captureOld = readJson(
  path.join(PREV, "smoke-capture/hop-02-settings/capture-arm-context.json"),
);

const pin = chats.softNavTraceObservability?.pinDiag ?? null;

const chatsAssertions = {
  input1: chats.runnerIsolation?.hopPointerdownCount === 1,
  waapiPhysical:
    chats.releaseChecks?.RELEASE_PHYSICAL_EVIDENCE_VALID === true &&
    String(chats.releaseChecks?.PHYSICAL_EVIDENCE_PROVIDER_SELECTED || "").includes("WAAPI"),
  bridgeComplete: chats.releaseChecks?.postSettleBridgeLifecycleValid === true,
  pinClear: pin?.activePin == null,
  finalShuffleProxy: chats.RELEASE_HOP_CLEAN === true,
  loading0: (chats.releaseChecks?.loadingShellVisibleFrameCount ?? 0) === 0,
  mismatch0: (chats.releaseChecks?.routePresentationMismatch ?? 0) === 0,
  RELEASE_HOP_CLEAN: chats.RELEASE_HOP_CLEAN === true,
};
chatsAssertions.chatsHopClean = Object.values(chatsAssertions).every(Boolean);

// Simulate live idle after chats (evidence: activePin null) with historical phases present.
const historicalTrace = [
  { activeTxPresent: true, phase: "preparing", txId: "tx-1-1-_chats" },
  { activeTxPresent: true, phase: "sliding", txId: "tx-1-1-_chats" },
  { activeTxPresent: false, phase: "settled", txId: "tx-1-1-_chats" },
];
const liveIdle = deriveLiveTransactionActive({
  liveTx: null,
  activePin: null,
  trace: historicalTrace,
});

const postChatsCanonicalIdle = {
  activeTxNull: true,
  noInFlightPin: pin?.activePin == null,
  bridgeNotPending: chats.releaseChecks?.postSettleBridgeLifecycleValid === true,
  historicalWouldHaveMarkedActive: liveIdle.historicalTraceWouldHaveMarkedActive === true,
  liveTransactionActive: liveIdle.transactionActive === true,
  canonicalIdle: liveIdle.transactionActive !== true && pin?.activePin == null,
  archivedTxWouldFalselyAppearActive: liveIdle.archivedTxWouldFalselyAppearActive === true,
};

// Reprocess Settings arm with FIXED live semantics + refreshed outer.
const captureFixed = buildProdTrueArmContext({
  ...captureOld,
  transactionActive: false, // live idle
  sourceTab: "settings",
});
captureFixed.liveActiveTxId = null;
captureFixed.livePinId = null;
captureFixed.historicalTraceWouldHaveMarkedActive = true;
captureFixed.transactionActiveSource = "live-runtime";

const outerRefreshed = refreshOuterArmContextForHop(outerRaw, captureFixed);
const pipeFixed = armProdTrueInputWithContext({
  context: captureFixed,
  evaluateProdTrueInputArm,
  outerContext: outerRefreshed,
});

const settingsPreArm = {
  oldCaptureTransactionActive: captureOld.transactionActive === true,
  oldOuterTransactionActive: outerRaw.transactionActive === true,
  oldOuterSourceTab: outerRaw.sourceTab,
  oldCaptureSourceTab: captureOld.sourceTab,
  oldEvent: settings.PROD_TRUE_INPUT_ARM_REJECTION?.event || "OUTER_CAPTURE_ARM_DIVERGENCE",
  oldTapCount: 0,
  fixedLiveTransactionActive: captureFixed.transactionActive === true,
  fixedOuterSourceTab: outerRefreshed?.sourceTab,
  fixedArmed: pipeFixed.PROD_TRUE_INPUT_ARMED === true,
  fixedDivergence: pipeFixed.OUTER_CAPTURE_ARM_DIVERGENCE === true,
  fixedMismatches: pipeFixed.consistency?.mismatches ?? [],
};

const report = {
  previousArtifact: PREV,
  chatsAssertions,
  postChatsCanonicalIdle,
  settingsPreArm,
  liveDeriveDemo: liveIdle,
  reprocessPass:
    chatsAssertions.chatsHopClean === true &&
    postChatsCanonicalIdle.canonicalIdle === true &&
    postChatsCanonicalIdle.archivedTxWouldFalselyAppearActive === true &&
    settingsPreArm.fixedArmed === true &&
    settingsPreArm.fixedDivergence !== true,
};

fs.writeFileSync(path.join(OUT, "reprocess-report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(OUT, "post-chats-canonical-idle-check.json"),
  JSON.stringify(postChatsCanonicalIdle, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "settings-arm-fresh-context-check.json"),
  JSON.stringify(settingsPreArm, null, 2),
);

console.log(JSON.stringify({ reprocessPass: report.reprocessPass, chatsClean: chatsAssertions.chatsHopClean, fixedArmed: settingsPreArm.fixedArmed }, null, 2));
process.exit(report.reprocessPass ? 0 : 2);
