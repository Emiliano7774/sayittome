/**
 * Reprocess failed staged rollout artifact after probe context-destroy crash.
 * Never declares rollout CLEAN without full 8/8 evidence.
 */
import fs from "node:fs";
import path from "node:path";

const prev =
  process.argv[2] ||
  "scripts/ghost-filmstrip-out/staged-rollout-bidirectional-no-loading-gate-1784010826815";
const out =
  process.argv[3] ||
  "scripts/ghost-filmstrip-out/bidirectional-prod-probe-context-destroyed-hardening-1784012179545";

const summaryPath = path.join(prev, "fresh-anon-bidirectional-prod-8dir-summary.json");
const logPath = path.join(prev, "fase4-fresh-prod-log.txt");
const finalPath = path.join(prev, "FINAL_STATUS.json");

let summary = null;
if (fs.existsSync(summaryPath)) {
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch {
    summary = null;
  }
}
const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
const finalStatus = fs.existsSync(finalPath)
  ? JSON.parse(fs.readFileSync(finalPath, "utf8"))
  : null;

const crash =
  /Execution context was destroyed/i.test(log) ||
  /Execution context was destroyed/i.test(JSON.stringify(summary || {}));
const directionsAttempted = (log.match(/^DIR /gm) || []).length;
const hasFull8 =
  Array.isArray(summary?.results) &&
  summary.results.length === 8 &&
  summary.results.every(
    (r) =>
      r.classification === "CLEAN" ||
      r.classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
  );

let newClassification = "PROD_HOP_NOT_EVALUATED_CONTEXT_DESTROYED_UNRECOVERABLE_OLD_ARTIFACT";
if (crash && !hasFull8) {
  newClassification = "PREVIOUS_ROLLOUT_INCOMPLETE_TOOLING_CRASH_CONFIRMED";
} else if (crash && summary?.results?.some((r) => r.CONTEXT_DESTROYED_DURING_NAVIGATION_HANDLED)) {
  newClassification = "PROD_HOP_CONTEXT_DESTROYED_HANDLED_REPROCESS_PARTIAL";
}

const report = {
  previousArtifact: prev,
  oldEstado:
    finalStatus?.estado ||
    "STAGED_ROLLOUT_BIDIRECTIONAL_FRESH_ANON_VISUAL_FAILED_ROLLED_BACK_FALSE",
  crashConfirmed: crash,
  directionsAttempted,
  hasFull8CleanEvidence: hasFull8,
  newClassification,
  rolloutCleanDeclared: false,
  NEW_TOOLING_READY_FOR_RETRY: true,
  note: "Old artifact lacks continuation/rebind data; incomplete tooling crash confirmed. Do not retroactively mark rollout clean.",
};

fs.writeFileSync(
  path.join(out, "reprocess-failed-rollout-context-destroyed.json"),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(
  path.join(out, "old-vs-new-classification.json"),
  JSON.stringify(
    {
      old: report.oldEstado,
      new: report.newClassification,
      rolloutCleanDeclared: false,
      invalidIfCleanOverstated: hasFull8 === false && report.rolloutCleanDeclared === true,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.rolloutCleanDeclared && !hasFull8 ? 2 : 0);
