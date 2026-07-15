/**
 * Reprocess staged-rollout logged-in Shuffle→Chats Chats inbox loading failure.
 */
import fs from "node:fs";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const roll =
  "scripts/ghost-filmstrip-out/staged-rollout-final-after-guard-coordination-orphan-fix-1784094134284/logged-in-prod/logged-in-8dir-summary.json";
const s = JSON.parse(fs.readFileSync(roll, "utf8"));
const bad = s.directions.find(
  (d) =>
    d.source === "shuffle" &&
    d.dest === "chats" &&
    d.classification === "DESTINATION_LOADING_VISIBLE",
);
const mid = bad?.midLoadingTail?.[0];
const gate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
  classification: "DESTINATION_LOADING_VISIBLE",
  anyLoadingText: true,
  midLoadingAfterRevealCount: bad?.midLoadingAfterRevealCount ?? 1,
  reachedDest: true,
  source: "shuffle",
  dest: "chats",
  clean: false,
  postHopCanonicalIdle: true,
});
const targetedPass = (() => {
  try {
    const t = JSON.parse(
      fs.readFileSync(
        "scripts/ghost-filmstrip-out/staged-rollout-final-after-guard-coordination-orphan-fix-1784094134284/prod-targeted/fresh-anon-8dir-summary.json",
        "utf8",
      ),
    );
    return t.hardPass === true;
  } catch {
    return false;
  }
})();
const freshPass = (() => {
  try {
    const t = JSON.parse(
      fs.readFileSync(
        "scripts/ghost-filmstrip-out/staged-rollout-final-after-guard-coordination-orphan-fix-1784094134284/fresh-anon-prod/fresh-anon-8dir-summary.json",
        "utf8",
      ),
    );
    return t.hardPass === true;
  } catch {
    return false;
  }
})();
const boostClean = s.directions.find(
  (d) => d.source === "boost" && d.dest === "shuffle",
);
const out = {
  gate: "REPROCESS_ROLLOUT_LOGGED_IN_SHUFFLE_CHATS_LOADING",
  pass:
    gate.pass === false &&
    bad?.midLoadingAfterRevealCount === 1 &&
    bad?.anyLoadingText === true &&
    mid?.mainLoadingText === true &&
    bad?.final?.pathname === "/chats" &&
    bad?.postHopCanonicalIdle === true &&
    targetedPass &&
    freshPass &&
    Boolean(boostClean?.clean || boostClean?.classification === "CLEAN"),
  oldFailPreserved: true,
  evidence: {
    mid: bad?.midLoadingAfterRevealCount,
    loadingTextAnywhere: bad?.anyLoadingText,
    mainLoadingText: mid?.mainLoadingText ?? null,
    pathname: bad?.final?.pathname,
    finalIdle: bad?.postHopCanonicalIdle,
    targetedPass,
    freshPass,
    boostShuffleClean: Boolean(
      boostClean?.clean || boostClean?.classification === "CLEAN",
    ),
  },
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 2);
