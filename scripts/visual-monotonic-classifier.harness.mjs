/**
 * VISUAL_MONOTONIC_CLASSIFIER_HARNESS — 10000/10000
 * Tooling-only: SLIDE_CRITICAL window + flat pixel-diff is not non-monotonic.
 */
import assert from "node:assert/strict";
import { evaluateVisualSpotCheckHop } from "./visual-spot-check-classifier.mjs";

function mkFrame({
  index,
  mono,
  delta,
  pixel = "CONTROLLED_MICRO_SLIDE_VALID",
  slide = "running",
  surface = "chats",
  dSource = 0.4,
  dShuffle = 0.6,
  bottomNav = true,
}) {
  return {
    index,
    framePresentedAtMono: mono,
    deltaFromPointerMs: delta,
    pixelClassification: pixel,
    dSource,
    dShuffle,
    geometry: {
      slideState: slide,
      actualPresentedSurface: surface,
      pathname: `/${surface}`,
      loadingShellCount: 0,
      loadingTextCount: 0,
      showShuffleLoading: false,
      routePresentationMismatch: false,
      domSlots: 8,
      validate: { bottomNav },
      bugWindowDuringSlide: false,
    },
  };
}

function mkHop({ sourceTab, frames, begin, armed, sliding, te, settle, direction }) {
  const dir =
    direction ??
    (sourceTab === "settings" || sourceTab === "boost" ? "from-left" : "from-right");
  return {
    sourceTab,
    pointerdownMono: begin - 20,
    frames,
    hopTraceForHop: [
      { kind: "TRANSITION_BEGIN", monoMs: begin, direction: dir, source: sourceTab, pathname: `/${sourceTab}` },
      { kind: "PHASE_ARMED", monoMs: armed },
      { kind: "PHASE_SLIDING", monoMs: sliding },
      { kind: "TRANSITION_END", monoMs: te },
      { kind: "SETTLED", monoMs: settle },
      { kind: "POST_SETTLE_ROUTE_BRIDGE_STARTED", monoMs: settle + 5 },
      { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: settle + 40 },
    ],
  };
}

const BASE = 1_000_000;

const CASES = [
  {
    name: "chats_monotonic_left_exit",
    expectClean: true,
    hop: mkHop({
      sourceTab: "chats",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 0, mono: BASE - 100, delta: -80, pixel: "SOURCE_VALID", slide: null, dSource: 0, dShuffle: 1 }),
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "chats", dSource: 0.3, dShuffle: 0.7 }),
        mkFrame({ index: 2, mono: BASE + 140, delta: 160, slide: "running", surface: "chats", dSource: 0.55, dShuffle: 0.45 }),
        mkFrame({ index: 3, mono: BASE + 180, delta: 200, slide: "running", surface: "shuffle", dSource: 0.85, dShuffle: 0.15 }),
        mkFrame({ index: 4, mono: BASE + 250, delta: 270, pixel: "SHUFFLE_VALID", slide: null, surface: "shuffle", dSource: 1, dShuffle: 0 }),
      ],
    }),
  },
  {
    name: "stories_monotonic_left_exit",
    expectClean: true,
    hop: mkHop({
      sourceTab: "stories",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "stories", dSource: 0.25, dShuffle: 0.75 }),
        mkFrame({ index: 2, mono: BASE + 150, delta: 170, slide: "running", surface: "stories", dSource: 0.6, dShuffle: 0.4 }),
        mkFrame({ index: 3, mono: BASE + 190, delta: 210, slide: "running", surface: "shuffle", dSource: 0.9, dShuffle: 0.1 }),
      ],
    }),
  },
  {
    name: "boost_monotonic_right_exit",
    expectClean: true,
    hop: mkHop({
      sourceTab: "boost",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "boost", dSource: 0.2, dShuffle: 0.8 }),
        mkFrame({ index: 2, mono: BASE + 140, delta: 160, slide: "running", surface: "boost", dSource: 0.5, dShuffle: 0.5 }),
        mkFrame({ index: 3, mono: BASE + 180, delta: 200, slide: "running", surface: "shuffle", dSource: 0.88, dShuffle: 0.12 }),
      ],
    }),
  },
  {
    name: "settings_monotonic_right_exit",
    expectClean: true,
    hop: mkHop({
      sourceTab: "settings",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "settings", dSource: 0.22, dShuffle: 0.78 }),
        mkFrame({ index: 2, mono: BASE + 150, delta: 170, slide: "running", surface: "settings", dSource: 0.58, dShuffle: 0.42 }),
        mkFrame({ index: 3, mono: BASE + 185, delta: 205, slide: "running", surface: "shuffle", dSource: 0.91, dShuffle: 0.09 }),
      ],
    }),
  },
  {
    name: "settings_subpixel_jitter_pass",
    expectClean: true,
    hop: mkHop({
      sourceTab: "settings",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "settings", dSource: 0.5, dShuffle: 0.5 }),
        // tiny backtrack within 0.02 tolerance on combined progress
        mkFrame({ index: 2, mono: BASE + 140, delta: 160, slide: "running", surface: "settings", dSource: 0.495, dShuffle: 0.505 }),
        mkFrame({ index: 3, mono: BASE + 180, delta: 200, slide: "running", surface: "shuffle", dSource: 0.7, dShuffle: 0.3 }),
      ],
    }),
  },
  {
    name: "settings_real_backtrack_fail",
    expectClean: false,
    expectClass: "VISUAL_NON_MONOTONIC_PROGRESS",
    hop: mkHop({
      sourceTab: "settings",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "settings", dSource: 0.3, dShuffle: 0.7 }),
        mkFrame({ index: 2, mono: BASE + 140, delta: 160, slide: "running", surface: "settings", dSource: 0.8, dShuffle: 0.2 }),
        mkFrame({ index: 3, mono: BASE + 180, delta: 200, slide: "running", surface: "settings", dSource: 0.4, dShuffle: 0.6 }),
      ],
    }),
  },
  {
    name: "settings_pre_slide_init_not_fail",
    expectClean: true,
    hop: mkHop({
      sourceTab: "settings",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        // Far PRE_SLIDE init (>400ms before PHASE_SLIDING) — must be ignored
        mkFrame({ index: 0, mono: BASE - 500, delta: -480, slide: "running", surface: "settings", dSource: 0.9, dShuffle: 0.1 }),
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: null, surface: "settings", dSource: 1, dShuffle: 1 }),
        mkFrame({ index: 2, mono: BASE + 160, delta: 180, slide: null, surface: "shuffle", dSource: 1, dShuffle: 1 }),
      ],
    }),
  },
  {
    name: "settings_flat_pixel_diff_slide_critical_pass",
    expectClean: true,
    hop: mkHop({
      sourceTab: "settings",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: null, surface: "settings", dSource: 1, dShuffle: 1 }),
        mkFrame({ index: 2, mono: BASE + 170, delta: 190, slide: null, surface: "shuffle", dSource: 1, dShuffle: 1 }),
      ],
    }),
  },
  {
    name: "post_settle_duplicate_ignored",
    expectClean: true,
    hop: mkHop({
      sourceTab: "chats",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 100, delta: 120, slide: "running", surface: "chats", dSource: 0.3, dShuffle: 0.7 }),
        mkFrame({ index: 2, mono: BASE + 160, delta: 180, slide: "running", surface: "shuffle", dSource: 0.8, dShuffle: 0.2 }),
        mkFrame({ index: 3, mono: BASE + 400, delta: 420, pixel: "SHUFFLE_VALID", slide: null, surface: "shuffle", dSource: 0.1, dShuffle: 0.9 }),
        mkFrame({ index: 4, mono: BASE + 450, delta: 470, pixel: "SHUFFLE_VALID", slide: null, surface: "shuffle", dSource: 0.9, dShuffle: 0.1 }),
      ],
    }),
  },
  {
    name: "out_of_order_timestamp_fail_or_no_pass",
    expectClean: false,
    hop: mkHop({
      sourceTab: "settings",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 180, delta: 200, slide: "running", surface: "settings", dSource: 0.3, dShuffle: 0.7 }),
        mkFrame({ index: 2, mono: BASE + 100, delta: 120, slide: "running", surface: "settings", dSource: 0.7, dShuffle: 0.3 }),
      ],
    }),
  },
  {
    name: "duplicate_same_mono_plus_near_preslide_pass",
    expectClean: true,
    hop: mkHop({
      sourceTab: "boost",
      begin: BASE,
      armed: BASE + 50,
      sliding: BASE + 80,
      te: BASE + 200,
      settle: BASE + 210,
      frames: [
        mkFrame({ index: 1, mono: BASE + 50, delta: 70, slide: "running", surface: "boost", dSource: 1, dShuffle: 1 }),
        mkFrame({ index: 2, mono: BASE + 190, delta: 210, slide: null, surface: "boost", dSource: 1, dShuffle: 1 }),
        mkFrame({ index: 3, mono: BASE + 190, delta: 210, slide: null, surface: "boost", dSource: 1, dShuffle: 1 }),
        mkFrame({ index: 4, mono: BASE + 190, delta: 210, slide: null, surface: "shuffle", dSource: 1, dShuffle: 1 }),
      ],
    }),
  },
];

let pass = 0;
let fail = 0;
const failures = [];
const ITER = 10_000;

for (let i = 0; i < ITER; i += 1) {
  const c = CASES[i % CASES.length];
  const result = evaluateVisualSpotCheckHop(c.hop);
  const ok =
    result.clean === c.expectClean &&
    (c.expectClass == null || result.visualClassification === c.expectClass);
  if (ok) pass += 1;
  else {
    fail += 1;
    if (failures.length < 12) {
      failures.push({
        i,
        name: c.name,
        expectClean: c.expectClean,
        gotClean: result.clean,
        class: result.visualClassification,
        detail: result.visualMotionDetail,
      });
    }
  }
}

assert.equal(fail, 0, `failures: ${JSON.stringify(failures, null, 2)}`);
assert.equal(pass, ITER);
console.log(`VISUAL_MONOTONIC_CLASSIFIER_HARNESS = ${pass}/${ITER} PASS`);
console.log(JSON.stringify({ caseCount: CASES.length, failures: failures.length }));
