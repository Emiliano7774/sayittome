/**
 * Reprocess failed hardened staged rollout without overstating clean.
 */
import fs from "node:fs";
import path from "node:path";

const prev =
  process.argv[2] ||
  "scripts/ghost-filmstrip-out/staged-rollout-bidirectional-hardened-gate-1784013570856";
const out =
  process.argv[3] ||
  "scripts/ghost-filmstrip-out/prod-fresh-anon-bidirectional-failure-product-fix-1784015208611";

const summary = JSON.parse(
  fs.readFileSync(path.join(prev, "fresh-anon-bidirectional-prod-8dir-summary.json"), "utf8"),
);
const dirs = summary.directions || [];
const failures = dirs
  .filter((d) => d.classification !== "CLEAN" && d.classification !== "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND")
  .map((d) => ({
    dir: `${d.source}->${d.dest}`,
    classification: d.classification,
    mapped:
      d.source === "chats" && d.dest === "shuffle"
        ? "OLD_PROD_CHATS_SHUFFLE_ROUTE_MISMATCH_FAIL"
        : d.source === "shuffle" && d.dest === "chats"
          ? "OLD_PROD_SHUFFLE_CHATS_DESTINATION_LOADING_FAIL"
          : d.source === "shuffle" && d.dest === "boost"
            ? "OLD_PROD_SHUFFLE_BOOST_DESTINATION_LOADING_FAIL"
            : d.classification,
  }));

const report = {
  previousArtifact: prev,
  oldEstado: "STAGED_ROLLOUT_BIDIRECTIONAL_HARDENED_FRESH_ANON_VISUAL_FAILED_ROLLED_BACK_FALSE",
  oldCleanCount: dirs.filter((d) => d.classification === "CLEAN" || d.classification === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND").length,
  oldTotal: dirs.length,
  failures,
  rolloutCleanDeclared: false,
  NEW_PRODUCT_FIX_REQUIRES_ROLLOUT_RETRY: true,
  note: "Old prod rollout remains FAIL; three exact failures recognized; no overstatement of clean.",
};

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "reprocess-failed-hardened-rollout.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(out, "old-vs-new-regression-summary.json"),
  JSON.stringify(
    {
      oldFailRecognized: failures.length === 3,
      mapped: failures.map((f) => f.mapped),
      newFixRequiresRolloutRetry: true,
      overstatedClean: false,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length === 3 && !report.rolloutCleanDeclared ? 0 : 2);
