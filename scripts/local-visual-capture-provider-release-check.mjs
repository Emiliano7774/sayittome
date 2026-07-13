/**
 * LOCAL_VISUAL_CAPTURE_PROVIDER_RELEASE_CHECK — 10/10
 * Wraps reliability cases once and records release-check JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const outDir = process.argv[2] || "scripts/ghost-filmstrip-out/visual-capture-provider-check";
fs.mkdirSync(outDir, { recursive: true });

const run = spawnSync(process.execPath, ["scripts/visual-capture-provider-reliability.harness.mjs"], {
  encoding: "utf8",
  cwd: process.cwd(),
});
let harness = null;
try {
  harness = JSON.parse(run.stdout);
} catch {
  harness = { ok: false, raw: run.stdout, stderr: run.stderr };
}

const report = {
  check: "LOCAL_VISUAL_CAPTURE_PROVIDER_RELEASE_CHECK",
  expectedCases: 10,
  harnessOk: harness?.ok === true,
  pass: harness?.ok === true ? 10 : 0,
  attempted: 10,
  ok: harness?.ok === true,
  invariants: harness?.invariants ?? null,
  failures: harness?.failures ?? [],
  cases: [
    "1-same-cdp-ts-different-hashes-retained",
    "2-same-cdp-ts-identical-hashes-deduped",
    "3-waapi-clean-no-active-frames-insufficient",
    "4-timestamp-collapse-or-fallback",
    "5-screenshot-burst-classifies-interpolation",
    "6-true-snap-with-active-frames",
    "7-settings-waapi-active-frames-clean",
    "8-loading-visible-fails",
    "9-black-root-fails",
    "10-route-mismatch-fails",
  ],
};
fs.writeFileSync(path.join(outDir, "visual-capture-provider-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
