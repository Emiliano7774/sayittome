/**
 * Reprocess FLR logged-in Boost→Shuffle orphan loading failure.
 */
import fs from "node:fs";
import { evaluateBidirectionalTabNoLoadingVisualGate } from "./bidirectional-tab-no-loading-visual-gate.mjs";

const flr =
  "scripts/ghost-filmstrip-out/full-local-release-after-sequence-guard-coordination-fix-1784050774574/logged-in-x3/logged-in-8dir-summary.json";
const s = JSON.parse(fs.readFileSync(flr, "utf8"));
const bad = s.directions.find(
  (d) =>
    d.source === "boost" &&
    d.dest === "shuffle" &&
    d.classification === "DESTINATION_LOADING_VISIBLE",
);
const mid = bad?.midLoadingTail ?? [];
const orphanMid =
  mid.length > 0 &&
  mid.every(
    (m) =>
      m.loadingTextAnywhere === true &&
      m.shuffleLoadingText === false &&
      m.mainLoadingText === false,
  );
const gate = evaluateBidirectionalTabNoLoadingVisualGate({
  visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
  classification: "DESTINATION_LOADING_VISIBLE",
  anyLoadingText: true,
  midLoadingAfterRevealCount: bad?.midLoadingAfterRevealCount ?? 5,
  reachedDest: true,
  source: "boost",
  dest: "shuffle",
  clean: false,
  postHopCanonicalIdle: true,
});
const out = {
  gate: "REPROCESS_FLR_LOGGED_IN_BOOST_SHUFFLE_ORPHAN",
  pass:
    gate.pass === false &&
    bad?.midLoadingAfterRevealCount === 5 &&
    bad?.anyLoadingText === true &&
    orphanMid === true &&
    bad?.final?.pathname === "/shuffle" &&
    bad?.final?.loadingTextAnywhere === false &&
    bad?.postHopCanonicalIdle === true,
  oldFailPreserved: true,
  evidence: {
    mid: bad?.midLoadingAfterRevealCount,
    loadingTextAnywhere: bad?.anyLoadingText,
    shuffleLoadingText: mid[0]?.shuffleLoadingText ?? null,
    mainLoadingText: mid[0]?.mainLoadingText ?? null,
    orphanMid,
    pathname: bad?.final?.pathname,
    finalIdle: bad?.postHopCanonicalIdle,
  },
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 2);
