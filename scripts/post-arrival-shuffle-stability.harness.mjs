/**
 * POST_ARRIVAL_SHUFFLE_STABILITY_GATE harness + old/new repro models.
 * Run: node scripts/post-arrival-shuffle-stability.harness.mjs [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  evaluatePostArrivalShuffleStabilityGate,
  simulateNewPostArrivalHandoff,
  simulateOldPostArrivalHandoff,
} from "./post-arrival-shuffle-stability-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outArg = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const oldSim = simulateOldPostArrivalHandoff({ activateDelayMs: 16 });
const newSim = simulateNewPostArrivalHandoff();

assert.ok(oldSim.postArrivalFlashCount > 0, "OLD_MANUAL_POST_ARRIVAL_SHUFFLE_FLASH_REPRODUCES");
assert.equal(newSim.postArrivalFlashCount, 0, "NEW must have zero flash frames");
assert.equal(newSim.POST_ARRIVAL_VISUAL_STABILITY, true);

const oldGate = evaluatePostArrivalShuffleStabilityGate({
  CAPTURE_PROVIDER_SELECTED: "CDP_SCREENCAST_ROBUST",
  postArrivalFlashCount: oldSim.postArrivalFlashCount,
  loadingTextAnywhereCount: 0,
  visualHashStableAfterArrival: false,
  shuffleDomIdentityStable: false,
  shuffleResultIdentityStable: true,
  shuffleSlotIdentityStable: false,
});
assert.equal(oldGate.pass, false);

const newGate = evaluatePostArrivalShuffleStabilityGate({
  CAPTURE_PROVIDER_SELECTED: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
  postArrivalFlashCount: 0,
  loadingTextAnywhereCount: 0,
  visualHashStableAfterArrival: true,
  shuffleDomIdentityStable: true,
  shuffleResultIdentityStable: true,
  shuffleSlotIdentityStable: true,
  poolRefetchVisibleDuringSettle: false,
  blackRoot: false,
  presentedNone: false,
});
assert.equal(newGate.pass, true);
assert.equal(newGate.status, "POST_ARRIVAL_SHUFFLE_STABILITY_PASS");

const noScreencastGate = evaluatePostArrivalShuffleStabilityGate({
  PHYSICAL_EVIDENCE_PROVIDER_SELECTED: "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST",
  postArrivalFlashCount: 0,
});
assert.equal(noScreencastGate.status, "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER");

const summary = {
  gate: "POST_ARRIVAL_SHUFFLE_STABILITY_GATE",
  OLD_MANUAL_POST_ARRIVAL_SHUFFLE_FLASH_REPRODUCES: oldSim.postArrivalFlashCount > 0,
  NEW_POST_ARRIVAL_VISUAL_STABLE: newSim.POST_ARRIVAL_VISUAL_STABILITY === true,
  oldSim,
  newSim,
  oldGate,
  newGate,
  noScreencastGate,
  status: "POST_ARRIVAL_SHUFFLE_STABILITY_HARNESS_PASS",
};

if (outArg) {
  writeJson(path.join(outArg, "post-arrival-shuffle-stability-harness.json"), summary);
}

console.log(JSON.stringify(summary, null, 2));
console.log("POST_ARRIVAL_SHUFFLE_STABILITY_HARNESS = PASS");
