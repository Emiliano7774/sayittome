/**
 * Local NO_LOADING_MID_SLIDE visual gate harness + old-artifact reprocess.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateNoLoadingMidSlideVisualGate,
  evaluatePermanentRolloutNoLoadingGate,
} from "./visual-spot-check-classifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const outArg = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const noScreencastHop = {
  PHYSICAL_EVIDENCE_PROVIDER_SELECTED: "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST",
  blackRootEvaluationStatus: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
  presentedNoneEvaluationStatus: "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
  sourceTab: "chats",
  VISUAL_SPOT_CHECK_CLEAN: true,
};
const noScreencastGate = evaluateNoLoadingMidSlideVisualGate(noScreencastHop);

const directColdHop = {
  entryMode: "direct-cold",
  sourceTab: "direct",
  destinationLoadingShellVisible: true,
};
const directColdGate = evaluateNoLoadingMidSlideVisualGate(directColdHop);

const cleanPixelHop = {
  CAPTURE_PROVIDER_SELECTED: "CDP_SCREENCAST_ROBUST",
  sourceTab: "chats",
  freshAnon: true,
  VISUAL_SPOT_CHECK_CLEAN: true,
  visualSpotCheck: {
    clean: true,
    loadingActuallyVisible: 0,
    loadingShellVisible: 0,
  },
  blackRootCritical: "PASS",
  presentedNoneCritical: "PASS",
};
const cleanGate = evaluateNoLoadingMidSlideVisualGate(cleanPixelHop);

const oldUserArtifact = path.join(
  root,
  "scripts/ghost-filmstrip-out/user-observed-loading-ghost-after-true-rollout-1783933539882",
);
let oldReprocess = {
  status: "USER_OBSERVED_LOADING_GHOST_OLD_FAIL",
  artifact: oldUserArtifact,
  exists: fs.existsSync(oldUserArtifact),
};
if (oldReprocess.exists) {
  const rootCausePath = path.join(oldUserArtifact, "root-cause-classification.json");
  const finalPath = path.join(oldUserArtifact, "final-status.json");
  oldReprocess.rootCause = fs.existsSync(rootCausePath)
    ? JSON.parse(fs.readFileSync(rootCausePath, "utf8"))
    : null;
  oldReprocess.finalStatus = fs.existsSync(finalPath)
    ? JSON.parse(fs.readFileSync(finalPath, "utf8"))
    : null;
  oldReprocess.noLoadingGate = evaluateNoLoadingMidSlideVisualGate({
    CAPTURE_PROVIDER_SELECTED: "CDP_SCREENCAST_ROBUST",
    sourceTab: "chats",
    freshAnon: true,
    destinationLoadingShellVisible: true,
    destinationLoadingTextVisible: true,
    visibleCargandoDuringCritical: true,
    VISUAL_SPOT_CHECK_CLEAN: false,
    visualSpotCheck: {
      clean: false,
      loadingActuallyVisible: 1,
      loadingShellVisible: 1,
      visualClassification: "VISUAL_LOADING_REAL",
    },
    blackRootCritical: "PASS",
    presentedNoneCritical: "PASS",
  });
}

const permanent = evaluatePermanentRolloutNoLoadingGate({
  requireFreshAnonVisual: true,
  freshAnonVisualGateRun: true,
  hops: [noScreencastHop, cleanPixelHop],
});

const summary = {
  gate: "NO_LOADING_MID_SLIDE_VISUAL_GATE",
  noScreencastMustNotClaimClean:
    noScreencastGate.status === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER" &&
    noScreencastGate.permanentRolloutEligible === false,
  directColdAllowed: directColdGate.status === "DIRECT_COLD_LOADING_ALLOWED",
  cleanPixelPass: cleanGate.status === "NO_LOADING_MID_SLIDE_PASS",
  permanentRolloutBlockedByNoScreencast: permanent.PERMANENT_ROLLOUT_NO_LOADING_GATE === false,
  oldUserArtifactReprocess: oldReprocess,
  noScreencastGate,
  directColdGate,
  cleanGate,
  permanent,
};

if (outArg) {
  writeJson(path.join(outArg, "no-loading-mid-slide-visual-gate-harness.json"), summary);
  writeJson(path.join(outArg, "old-user-report-reprocess.json"), oldReprocess);
  writeJson(path.join(outArg, "waapi-classifier-reprocess.json"), {
    note: "no-screencast permanent rollout ineligible for no-loading contract",
    noScreencastGate,
    permanent,
  });
}

console.log(JSON.stringify(summary, null, 2));
process.exit(
  summary.noScreencastMustNotClaimClean &&
    summary.directColdAllowed &&
    summary.cleanPixelPass &&
    summary.permanentRolloutBlockedByNoScreencast
    ? 0
    : 1,
);
