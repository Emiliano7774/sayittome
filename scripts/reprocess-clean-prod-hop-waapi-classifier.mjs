/**
 * Offline reprocess of clean prod hop with WAAPI-aware classifier.
 * No prod input / deploy / commit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyProdHopDetailed } from "./prod-hop-waapi-classifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CLEAN =
  "scripts/ghost-filmstrip-out/final-prod-hop-retry-after-firebase-recovery-history-waapi-guarded-1783926857056";
const OUT =
  process.argv[2] ||
  path.join(
    ROOT,
    "scripts/ghost-filmstrip-out/pre-commit-hygiene-waapi-classifier-followup-reprocess",
  );

fs.mkdirSync(OUT, { recursive: true });

const report = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, CLEAN, "prod-single-hop-verified-true-delivery-report.json"),
    "utf8",
  ),
);
const oldClassification = JSON.parse(
  fs.readFileSync(path.join(ROOT, CLEAN, "prod-hop-classification.json"), "utf8"),
);
const oldFinal = JSON.parse(
  fs.readFileSync(path.join(ROOT, CLEAN, "FINAL_STATUS.json"), "utf8"),
);

const hop01 = JSON.parse(
  fs.readFileSync(path.join(ROOT, CLEAN, "hop-capture/hop-01-chats/hop-report.json"), "utf8"),
);
const hop02 = JSON.parse(
  fs.readFileSync(path.join(ROOT, CLEAN, "hop-capture/hop-02-chats/hop-report.json"), "utf8"),
);

const hopReport = report.hopReport ?? hop01;
const deliveryVerified = report.PRODUCTION_FLAG_TRUE_VERIFIED === true;
const rollbackOk = report.ROLLBACK_TO_FALSE_DEPLOYED === true;

const classified = classifyProdHopDetailed(hopReport, rollbackOk, deliveryVerified, {
  secondaryHopReports: [hop02],
  reportLogicalInputCount: report.logicalInputCount,
  reportPointerdownCount: report.pointerdownCount,
  requireRollback: true,
});

const estado =
  classified.status === "PROD_SINGLE_HOP_CLEAN" && rollbackOk
    ? "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_CLEAN_ROLLED_BACK_FALSE_READY_FOR_COMMIT_REVIEW"
    : classified.status === "PROD_SINGLE_HOP_CLEAN"
      ? "CLEAN_PROD_WAAPI_HOP_BUT_ROLLBACK_UNVERIFIED"
      : "COMMIT_REVIEW_BLOCKED_OLD_CLASSIFIER_GATE_STILL_ACTIVE";

const comparison = {
  oldAutomaticStatus: report.hopClassification,
  oldAutomatedRunnerEstado: report.estado,
  oldFase8Authoritative: oldClassification.authoritativeStatus,
  oldFinalEstado: oldFinal.estado,
  newAutomaticStatus: classified.status,
  newEstado: estado,
  deliveryVerified,
  rollbackOk,
  txId: hopReport?.hopNineEvidence?.currentHopTransactionIdResolved ?? null,
  input: {
    reportLogicalInputCount: report.logicalInputCount,
    reportPointerdownCount: report.pointerdownCount,
    hop01Pointerdown: hop01?.runnerIsolation?.hopPointerdownCount ?? null,
    hop02Pointerdown: hop02?.runnerIsolation?.hopPointerdownCount ?? 0,
    hop02ArmRejected: hop02?.PROD_TRUE_INPUT_ARM_REJECTED === true,
    classifierInputs: {
      totalRealInputCount: classified.diagnostics.totalRealInputCount,
      secondaryArmRejectedIgnored:
        classified.diagnostics.PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED,
    },
  },
  motor: {
    detected: classified.diagnostics.PROD_HOP_CLASSIFIER_MOTOR_DETECTED,
    waapiMode: classified.diagnostics.PROD_HOP_CLASSIFIER_WAAPI_MODE,
    cssMode: classified.diagnostics.PROD_HOP_CLASSIFIER_CSS_MODE,
    cssTransitionRequiredInWaapi:
      classified.diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI !== true,
    waapiPhysicalAccepted:
      classified.diagnostics.waapi?.PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED === true,
    settleReason: classified.diagnostics.settleReason,
  },
  bridgePin: {
    bridgeCompleted: classified.diagnostics.bridgeCompleted,
    pinCleared: classified.diagnostics.pinCleared,
  },
  loading: {
    shell: classified.diagnostics.loadingShellVisibleFrameCount,
    mismatch: classified.diagnostics.routeMismatchFrameCount,
  },
  visual: {
    BLACK_ROOT_CRITICAL: classified.diagnostics.BLACK_ROOT_CRITICAL,
    PRESENTED_NONE_CRITICAL: classified.diagnostics.PRESENTED_NONE_CRITICAL,
    NO_FAKE_VISUAL_ZEROS: classified.diagnostics.NO_FAKE_VISUAL_ZEROS,
  },
  reprocessClean: classified.status === "PROD_SINGLE_HOP_CLEAN" && rollbackOk,
};

fs.writeFileSync(
  path.join(OUT, "reprocess-clean-prod-hop-old-vs-new.json"),
  JSON.stringify(comparison, null, 2),
);
fs.writeFileSync(
  path.join(OUT, "reprocess-clean-prod-hop-classification.json"),
  JSON.stringify(
    {
      status: classified.status,
      estado,
      diagnostics: classified.diagnostics,
    },
    null,
    2,
  ),
);

const timeline = [
  "field,old,new",
  `automaticStatus,${report.hopClassification},${classified.status}`,
  `estado,${report.estado},${estado}`,
  `motor,,${classified.diagnostics.PROD_HOP_CLASSIFIER_MOTOR_DETECTED}`,
  `waapiPhysical,,${classified.diagnostics.waapi?.PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED}`,
  `cssTransitionRequiredInWaapi,,${classified.diagnostics.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI !== true}`,
  `totalRealInputs,,${classified.diagnostics.totalRealInputCount}`,
  `hop02IgnoredAsSecondInput,,${classified.diagnostics.PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED}`,
  `rollbackOk,${rollbackOk},${rollbackOk}`,
];
fs.writeFileSync(path.join(OUT, "reprocess-clean-prod-hop-timeline.csv"), timeline.join("\n"));

console.log(JSON.stringify(comparison, null, 2));
if (!comparison.reprocessClean) process.exit(1);
