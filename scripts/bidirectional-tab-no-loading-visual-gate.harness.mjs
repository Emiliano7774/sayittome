/**
 * BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE_HARNESS
 */
import {
  evaluateBidirectionalTabNoLoadingVisualGate,
  evaluateBidirectionalSeries,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];

function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  if (!cond) console.error("FAIL", name);
  else console.log("PASS", name);
}

// 1 destination loading visible -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DESTINATION_LOADING_VISIBLE",
    anyLoadingText: true,
  });
  check("destination loading visible -> fail", r.pass === false);
}

// 2 source loading visible -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "SOURCE_LOADING_VISIBLE",
    anyLoadingText: true,
  });
  check("source loading visible -> fail", r.pass === false);
}

// 3 both loading -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BOTH_LOADING_VISIBLE",
    anyLoadingShell: true,
  });
  check("both loading -> fail", r.pass === false);
}

// 4 no-screencast -> not evaluated
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "NATIVE_NO_SCREENCAST",
    classification: "CLEAN",
    clean: true,
  });
  check(
    "no-screencast -> not evaluated",
    r.status === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER" && r.rolloutEligible === false,
  );
}

// 5 direct cold allowed
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "DIRECT_COLD_LOADING_ALLOWED",
    anyLoadingText: true,
  });
  check("direct cold loading -> allowed", r.pass === true);
}

// 6 all 8 fresh anon clean -> pass
{
  const hops = Array.from({ length: 8 }, (_, i) => ({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    clean: true,
    source: String(i),
  }));
  const s = evaluateBidirectionalSeries(hops);
  check("8 fresh anon clean -> pass", s.pass === true && s.cleanCount === 8);
}

// 7 all 8 logged-in clean -> pass
{
  const hops = Array.from({ length: 8 }, () => ({
    visualProvider: "CDP_SCREENCAST_VISUAL_SPOT_CHECK_ROBUST_IDENTITY",
    classification: "CLEAN",
    clean: true,
  }));
  const s = evaluateBidirectionalSeries(hops);
  check("8 logged-in clean -> pass", s.pass === true);
}

// 8 hidden nav / unavailable -> SKIPPED not clean
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "SKIPPED_SOURCE_UNAVAILABLE",
  });
  check(
    "unavailable source -> skipped not clean",
    r.status === "SKIPPED_SOURCE_UNAVAILABLE" && r.clean === false,
  );
}

// 9 black/root -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    blackRoot: true,
  });
  check("black/root -> fail", r.pass === false);
}

// 10 presented-none -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    presentedNone: true,
  });
  check("presented-none -> fail", r.pass === false);
}

// 11 archived tx as live -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    archivedInterpretedAsLiveCount: 1,
  });
  check("archived tx as live -> fail", r.pass === false);
}

// 12 canonical idle missing -> fail
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "CLEAN",
    postHopCanonicalIdle: false,
  });
  check("canonical idle missing -> fail", r.pass === false);
}

// 13 clean with context rebind -> pass
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    clean: true,
    reachedDest: true,
    postHopCanonicalIdle: true,
  });
  check("clean with context rebind -> pass", r.pass === true && r.rolloutEligible === true);
}

// 14 context destroyed unrecoverable -> not rollout eligible
{
  const r = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_NOT_EVALUATED_CONTEXT_DESTROYED_UNRECOVERABLE",
  });
  check(
    "context destroyed unrecoverable -> not eligible",
    r.pass === false && r.rolloutEligible === false,
  );
}

const failed = cases.filter((c) => !c.pass);
const scaledTotal = 100000;
const scaledPass =
  failed.length === 0
    ? scaledTotal
    : Math.floor(((cases.length - failed.length) / cases.length) * scaledTotal);
console.log(
  JSON.stringify(
    {
      harness: "BIDIRECTIONAL_TAB_NO_LOADING_VISUAL_GATE_HARNESS",
      total: cases.length,
      failed: failed.length,
      scaled: `${scaledPass}/${scaledTotal}`,
      cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);
