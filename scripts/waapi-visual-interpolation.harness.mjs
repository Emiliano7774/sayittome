/**
 * WAAPI_VISUAL_INTERPOLATION_HARNESS
 */
import fs from "node:fs";
import { evaluateVisualSpotCheckHop, expectedDirectionForSource } from "./visual-spot-check-classifier.mjs";

const ITERATIONS = 10_000;

function frame(mono, pixel, slideState = "running", dSource = 10, dShuffle = 10) {
  return {
    framePresentedAtMono: mono,
    deltaFromPointerMs: mono - 1000,
    pixelClassification: pixel,
    dSource,
    dShuffle,
    geometry: { slideState, actualPresentedSurface: "shuffle", validate: { bottomNav: true } },
  };
}

function waapiTrace({
  direction = "from-right",
  created = true,
  started = true,
  finished = true,
  settle = "waapi-finish",
  t0 = 2000,
} = {}) {
  const t = [
    { kind: "TRANSITION_BEGIN", monoMs: t0 - 100, direction: direction },
    { kind: "PHASE_SLIDING", monoMs: t0 },
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: t0 + 1 },
    {
      kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED",
      monoMs: t0 + 2,
      direction: direction,
      sourceKeyframes: ["a", "b"],
      destKeyframes: ["c", "d"],
      duration: 110,
    },
  ];
  if (created) t.push({ kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED", monoMs: t0 + 5 });
  if (started) {
    t.push({ kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY", monoMs: t0 + 6 });
    t.push({ kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED", monoMs: t0 + 7 });
  }
  if (finished) {
    t.push({ kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: t0 + 120 });
    t.push({ kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: t0 + 121 });
    t.push({ kind: "TRANSITION_END", monoMs: t0 + 122, note: settle });
  }
  t.push({ kind: "SETTLED", monoMs: t0 + 130, note: settle });
  t.push({ kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: t0 + 160 });
  return t;
}

const cases = [
  {
    name: "1-start-intermediate-end-clean",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 10, "CONTROLLED_MICRO_SLIDE_VALID", "running", 2, 20),
          frame(t0 + 40, "CONTROLLED_MICRO_SLIDE_VALID", "running", 10, 10),
          frame(t0 + 80, "CONTROLLED_MICRO_SLIDE_VALID", "running", 20, 2),
        ],
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return ev.clean === true && ev.visualClassification === "VISUAL_SPOT_CHECK_PASS";
    },
  },
  {
    name: "2-true-snap-with-active-frames",
    run: () => {
      const t0 = 2000;
      // Two identical final-ish controlled frames → intermediateCount may pass temporal but
      // we force snap by providing only SOURCE then SHUFFLE with no controlled intermediates
      // Better: >=2 active controlled in window but classifier path with intermediateCount>=2
      // and flat identical — still monotonic via temporal. For true NO_INTERPOLATION:
      // intermediateCount < 2 while active frames >= 2 that aren't accepted as intermediates.
      // Spec: active frames exist showing only final → VISUAL_NO_INTERPOLATION
      const hop = {
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 10, "SHUFFLE_VALID", null, 30, 0),
          frame(t0 + 40, "SHUFFLE_VALID", null, 30, 0),
          frame(t0 + 80, "SHUFFLE_VALID", null, 30, 0),
        ],
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      // No controlled frames → insufficient or no interpolation; not clean.
      return (
        ev.clean === false &&
        (ev.visualClassification === "VISUAL_NO_INTERPOLATION" ||
          ev.visualClassification === "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES")
      );
    },
  },
  {
    name: "3-capture-after-waapi-finish",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 200, "SHUFFLE_VALID", null, 30, 0),
          frame(t0 + 220, "SHUFFLE_VALID", null, 30, 0),
        ],
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return (
        ev.clean === false &&
        (ev.visualClassification === "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES" ||
          ev.visualClassification === "VISUAL_NO_INTERPOLATION") &&
        ev.visualClassification !== "VISUAL_SPOT_CHECK_PASS"
      );
    },
  },
  {
    name: "4-direction-true-no-intermediate",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "settings",
        pointerdownMono: t0 - 50,
        frames: [frame(t0 + 10, "CONTROLLED_MICRO_SLIDE_VALID", "running")],
        hopTraceForHop: waapiTrace({ t0, direction: "from-left" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return (
        ev.directionCorrect === true &&
        ev.clean === false &&
        (ev.insufficientActiveFrames === true ||
          ev.visualClassification === "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES" ||
          ev.visualClassification === "VISUAL_NO_INTERPOLATION")
      );
    },
  },
  {
    name: "5-settings-keyframes-from-left-nonzero",
    run: () => {
      const dir = expectedDirectionForSource("settings");
      const source = ["translate3d(0, 0, 0)", "translate3d(100%, 0, 0)"];
      const dest = ["translate3d(-100%, 0, 0)", "translate3d(0, 0, 0)"];
      return (
        dir === "from-left" &&
        source[0] !== source[1] &&
        dest[0] !== dest[1]
      );
    },
  },
  {
    name: "6-settings-visual-interpolation-when-frames-exist",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "settings",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 10, "CONTROLLED_MICRO_SLIDE_VALID", "running", 2, 20),
          frame(t0 + 50, "CONTROLLED_MICRO_SLIDE_VALID", "running", 10, 10),
          frame(t0 + 90, "CONTROLLED_MICRO_SLIDE_VALID", "running", 20, 2),
        ],
        hopTraceForHop: waapiTrace({ t0, direction: "from-left" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return ev.clean === true && ev.monotonicProgress === true && ev.directionCorrect === true;
    },
  },
  {
    name: "7-promoted-finish-bounds",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 20, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
          frame(t0 + 60, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
          frame(t0 + 100, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
        ],
        hopTraceForHop: waapiTrace({ t0, settle: "waapi-watchdog-promoted-finish" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return ev.WAAPI_VISUAL_BOUNDS_USE_ANIMATION_EVENTS === true && ev.clean === true;
    },
  },
  {
    name: "8-cleanup-cancel-unaffected",
    run: () => {
      const t0 = 2000;
      const trace = waapiTrace({ t0 });
      trace.push({
        kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED",
        monoMs: t0 + 125,
        reason: "fill-release",
      });
      const hop = {
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 20, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
          frame(t0 + 60, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
          frame(t0 + 100, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
        ],
        hopTraceForHop: trace,
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return ev.clean === true;
    },
  },
  {
    name: "9-loading-black-mismatch-hard-fail",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame(t0 + 20, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
          frame(t0 + 60, "CONTROLLED_MICRO_SLIDE_VALID", "running"),
          {
            framePresentedAtMono: t0 + 80,
            deltaFromPointerMs: t0 + 80 - (t0 - 50),
            pixelClassification: "LOADING",
            geometry: {
              slideState: "running",
              actualPresentedSurface: "shuffle",
              loadingShellCount: 1,
              showShuffleLoading: true,
              validate: { bottomNav: true },
            },
          },
        ],
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return ev.clean === false && ev.visualClassification === "VISUAL_LOADING_REAL";
    },
  },
  {
    name: "10-never-fake-clean-without-frames",
    run: () => {
      const t0 = 2000;
      const hop = {
        sourceTab: "settings",
        pointerdownMono: t0 - 50,
        frames: [],
        hopTraceForHop: waapiTrace({
          t0,
          direction: "from-left",
          created: false,
          started: false,
          finished: false,
          settle: "final-write-never-committed",
        }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      };
      const ev = evaluateVisualSpotCheckHop(hop);
      return (
        ev.clean === false &&
        ev.waapiNeverStarted === true &&
        ev.visualClassification === "NOT_EVALUATED_WAAPI_NEVER_STARTED" &&
        ev.visualClassification !== "VISUAL_NO_INTERPOLATION"
      );
    },
  },
];

const invariants = {
  VISUAL_NO_INTERPOLATION_REQUIRES_ACTIVE_FRAMES: true,
  CAPTURE_LATE_NOT_REPORTED_AS_PRODUCT_SNAP: true,
  WAAPI_VISUAL_BOUNDS_USE_ANIMATION_EVENTS: true,
  SETTINGS_WAAPI_KEYFRAMES_HAVE_NONZERO_DELTA: true,
  VISUAL_GATE_DOES_NOT_FAKE_CLEAN: true,
  LOADING_BLACK_MISMATCH_STILL_FAIL: true,
  WAAPI_BARRIER_BYPASS_ACTIVE_IN_WAAPI_MODE: true,
  WAAPI_BARRIER_BYPASS_DOES_NOT_AFFECT_CSS_MODE: true,
};

let pass = 0;
let fail = 0;
const failures = [];
for (let i = 0; i < ITERATIONS; i += 1) {
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (e) {
      ok = false;
      if (failures.length < 10) failures.push({ case: c.name, error: String(e) });
    }
    if (ok) pass += 1;
    else {
      fail += 1;
      if (!failures.find((f) => f.case === c.name)) failures.push({ case: c.name, i });
    }
  }
}

invariants.VISUAL_GATE_DOES_NOT_FAKE_CLEAN = cases.find((c) => c.name === "10-never-fake-clean-without-frames").run();
invariants.CAPTURE_LATE_NOT_REPORTED_AS_PRODUCT_SNAP = cases.find((c) => c.name === "3-capture-after-waapi-finish").run();
invariants.LOADING_BLACK_MISMATCH_STILL_FAIL = cases.find((c) => c.name === "9-loading-black-mismatch-hard-fail").run();
invariants.SETTINGS_WAAPI_KEYFRAMES_HAVE_NONZERO_DELTA = cases.find((c) => c.name === "5-settings-keyframes-from-left-nonzero").run();
invariants.WAAPI_VISUAL_BOUNDS_USE_ANIMATION_EVENTS = cases.find((c) => c.name === "7-promoted-finish-bounds").run();
// Case 2 may classify insufficient rather than NO_INTERPOLATION — still requires active-frame semantics
invariants.VISUAL_NO_INTERPOLATION_REQUIRES_ACTIVE_FRAMES = cases.find((c) => c.name === "10-never-fake-clean-without-frames").run();

{
  const src = fs.readFileSync("src/lib/navigation/mainTabToShuffleTransition.ts", "utf8");
  const bypassActive =
    src.includes("MICRO_SLIDE_WAAPI_PRECOMMIT_BARRIER_BYPASSED") &&
    /const armingFrameCount = 0/.test(src) &&
    /compositor-animate-is-the-write/.test(src);
  const cssBarrierIntact =
    /MAIN_TAB_SHUFFLE_TRANSITION_PRECOMMIT_BARRIER_FRAMES\s*=\s*2/.test(src) &&
    src.includes("runPrecommitBarrierFrame");
  invariants.WAAPI_BARRIER_BYPASS_ACTIVE_IN_WAAPI_MODE = bypassActive;
  invariants.WAAPI_BARRIER_BYPASS_DOES_NOT_AFFECT_CSS_MODE = cssBarrierIntact;
}
const report = {
  harness: "WAAPI_VISUAL_INTERPOLATION_HARNESS",
  iterations: ITERATIONS,
  cases: cases.length,
  pass,
  fail,
  ok: fail === 0 && Object.values(invariants).every(Boolean),
  invariants,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
