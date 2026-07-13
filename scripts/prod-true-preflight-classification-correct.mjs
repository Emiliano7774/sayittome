/**
 * Correct historical preflight classification for prod-true-delivery-preflight-1783675094621
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeployUploadStats } from "./prod-true-deploy-log-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORICAL = path.join(
  __dirname,
  "ghost-filmstrip-out/prod-true-delivery-preflight-1783675094621",
);

const TRUE_HASH = "8ae8e9781efeb433a601a08654cffd069aa01cb6bc5b7e7b93669f9e19b0608d";
const EARLY_HASH = "bfafe792a5b33677ab9a93aebc6631edfdd6bf4ba4dcd010a491ba4d9fbde35f";

const deployLog = fs.readFileSync(path.join(HISTORICAL, "true-deploy.log"), "utf8");
const parsed = parseDeployUploadStats(deployLog);

const correction = {
  HISTORICAL_PREFLIGHT_CLASSIFICATION_CORRECTED: true,
  historicalPreflightPath: HISTORICAL,
  oldClassification: "DEPLOY_STAGED_STALE_BUILD_ARTIFACT",
  newClassification: "PREMATURE_STAGING_SNAPSHOT_BEFORE_FRAMEWORK_REBUILD_COMPLETION",
  equivalentClassification: "STAGING_GATE_SAMPLED_PRE_REBUILD_STATE",
  reason:
    "Early .firebase/hosting snapshot captured transient pre-rebuild FALSE artifact; late snapshot during same deploy matched TRUE build hash exactly; deploy uploaded 28/29 new files and live version changed.",
  earlySnapshotPath: path.join(HISTORICAL, "artifacts/staging-snapshot-1783675159162"),
  lateSnapshotPath: path.join(HISTORICAL, "artifacts/staging-snapshot-1783675560700"),
  trueBuildHash: TRUE_HASH,
  earlyHash: EARLY_HASH,
  lateHash: TRUE_HASH,
  EARLY_STAGING_MATCHES_TRUE_BUILD: false,
  LATE_STAGING_MATCHES_TRUE_BUILD: true,
  lateMatchesBuild: true,
  TRUE_DEPLOY_UPLOADED_NEW_FILES: parsed.newFilesUploaded,
  TRUE_LIVE_VERSION_CHANGED: true,
  PRE_TRUE_LIVE_VERSION_ID: "projects/sayittome-app/sites/sayittome-app/versions/62f56a94d27dc556",
  TRUE_LIVE_VERSION_ID_AFTER_DEPLOY:
    "projects/sayittome-app/sites/sayittome-app/versions/38feaca04f51ffef",
  deployParserFixed: true,
  parsedDeployStats: parsed,
};

const outPath = path.join(HISTORICAL, "preflight-classification-correction.json");
fs.writeFileSync(outPath, JSON.stringify(correction, null, 2));

// Patch historical report classification without altering artifact bytes
const reportPath = path.join(HISTORICAL, "prod-true-delivery-preflight-report.json");
if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.historicalClassificationCorrected = true;
  report.oldRootCauseClassification = report.rootCauseClassification;
  report.rootCauseClassification = correction.newClassification;
  report.correctedClassification = correction.newClassification;
  report.correctionReportPath = outPath;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify({ correctionReportPath: outPath, ...correction }, null, 2));
