/**
 * VISUAL_CAPTURE_PROVIDER_RELIABILITY_HARNESS
 */
import {
  dedupeVisualFrames,
  detectTimestampCollapse,
  selectVisualCaptureProvider,
  CAPTURE_PROVIDER_SCREENSHOT_BURST,
  CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
} from "./visual-capture-frame-identity.mjs";
import { evaluateVisualSpotCheckHop } from "./visual-spot-check-classifier.mjs";

const ITERATIONS = 100_000;

function frame(partial) {
  return {
    framePresentedAtMono: 2000,
    receiveMonoMs: 2000,
    deltaFromPointerMs: 50,
    pixelClassification: "CONTROLLED_MICRO_SLIDE_VALID",
    dSource: 10,
    dShuffle: 10,
    geometry: {
      slideState: "running",
      actualPresentedSurface: "in-slide",
      validate: { bottomNav: true },
    },
    ...partial,
  };
}

function waapiTrace({ direction = "from-left", t0 = 2000 } = {}) {
  return [
    { kind: "TRANSITION_BEGIN", monoMs: t0 - 100, direction },
    { kind: "PHASE_SLIDING", monoMs: t0 },
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED", monoMs: t0 + 1 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED", monoMs: t0 + 5 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY", monoMs: t0 + 6 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED", monoMs: t0 + 7 },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", monoMs: t0 + 120 },
    { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED", monoMs: t0 + 121 },
    { kind: "SETTLED", monoMs: t0 + 130, note: "waapi-finish" },
    { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: t0 + 160 },
  ];
}

const cases = [
  {
    name: "1-same-cdp-ts-different-hashes-retained",
    run: () => {
      const frames = [
        frame({ index: 0, frameId: 0, framePresentedAtMono: 100, bufferHash: "aaa", receiveMonoMs: 100 }),
        frame({ index: 1, frameId: 1, framePresentedAtMono: 100, bufferHash: "bbb", receiveMonoMs: 101 }),
        frame({ index: 2, frameId: 2, framePresentedAtMono: 100, bufferHash: "ccc", receiveMonoMs: 102 }),
      ];
      const out = dedupeVisualFrames(frames);
      const collapse = detectTimestampCollapse(frames);
      return out.length === 3 && collapse.VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED === true;
    },
  },
  {
    name: "2-same-cdp-ts-identical-hashes-deduped",
    run: () => {
      const frames = [
        frame({ index: 0, frameId: 0, framePresentedAtMono: 100, bufferHash: "aaa", receiveMonoMs: 100 }),
        frame({ index: 1, frameId: 1, framePresentedAtMono: 100, bufferHash: "aaa", receiveMonoMs: 101 }),
      ];
      return dedupeVisualFrames(frames).length === 1;
    },
  },
  {
    name: "3-waapi-clean-no-active-frames-insufficient",
    run: () => {
      const t0 = 2000;
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "settings",
        pointerdownMono: t0 - 50,
        frames: [
          frame({
            framePresentedAtMono: t0 + 400,
            receiveMonoMs: t0 + 400,
            pixelClassification: "SHUFFLE_VALID",
            bufferHash: "z",
            geometry: { slideState: null, validate: { bottomNav: true } },
          }),
        ],
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return (
        ev.clean === false &&
        ev.visualClassification === "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES" &&
        ev.visualClassification !== "VISUAL_NO_INTERPOLATION"
      );
    },
  },
  {
    name: "4-timestamp-collapse-or-fallback",
    run: () => {
      const screencast = [
        frame({ index: 0, framePresentedAtMono: 50, bufferHash: "a", receiveMonoMs: 50 }),
        frame({ index: 1, framePresentedAtMono: 50, bufferHash: "b", receiveMonoMs: 51 }),
      ];
      const sel = selectVisualCaptureProvider({
        preferred: CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
        screencastFrames: screencast,
        burstFrames: [
          frame({ index: 10, framePresentedAtMono: 40, bufferHash: "c", receiveMonoMs: 40 }),
          frame({ index: 11, framePresentedAtMono: 55, bufferHash: "d", receiveMonoMs: 55 }),
        ],
        activeScreencast: screencast,
        activeBurst: [
          frame({ index: 10, bufferHash: "c", receiveMonoMs: 40 }),
          frame({ index: 11, bufferHash: "d", receiveMonoMs: 55 }),
        ],
      });
      const collapse = detectTimestampCollapse(screencast);
      return (
        collapse.VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED === true ||
        sel.VISUAL_CAPTURE_PROVIDER_SELECTED === CAPTURE_PROVIDER_SCREENSHOT_BURST ||
        sel.VISUAL_CAPTURE_PROVIDER_FALLBACK_SELECTED === CAPTURE_PROVIDER_SCREENSHOT_BURST
      );
    },
  },
  {
    name: "5-screenshot-burst-classifies-interpolation",
    run: () => {
      const t0 = 2000;
      const frames = [
        frame({
          index: 0,
          frameId: 0,
          framePresentedAtMono: t0 + 10,
          receiveMonoMs: t0 + 10,
          bufferHash: "b1",
          dSource: 2,
          dShuffle: 20,
          captureProviderSource: CAPTURE_PROVIDER_SCREENSHOT_BURST,
        }),
        frame({
          index: 1,
          frameId: 1,
          framePresentedAtMono: t0 + 50,
          receiveMonoMs: t0 + 50,
          bufferHash: "b2",
          dSource: 10,
          dShuffle: 10,
          captureProviderSource: CAPTURE_PROVIDER_SCREENSHOT_BURST,
        }),
        frame({
          index: 2,
          frameId: 2,
          framePresentedAtMono: t0 + 90,
          receiveMonoMs: t0 + 90,
          bufferHash: "b3",
          dSource: 20,
          dShuffle: 2,
          captureProviderSource: CAPTURE_PROVIDER_SCREENSHOT_BURST,
        }),
      ];
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "settings",
        pointerdownMono: t0 - 50,
        frames,
        VISUAL_CAPTURE_PROVIDER_SELECTED: CAPTURE_PROVIDER_SCREENSHOT_BURST,
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return ev.clean === true && frames.every((f) => typeof f.receiveMonoMs === "number");
    },
  },
  {
    name: "6-true-snap-with-active-frames",
    run: () => {
      const t0 = 2000;
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame({
            framePresentedAtMono: t0 + 10,
            receiveMonoMs: t0 + 10,
            bufferHash: "s1",
            pixelClassification: "SHUFFLE_VALID",
            geometry: { slideState: null, validate: { bottomNav: true } },
          }),
          frame({
            framePresentedAtMono: t0 + 40,
            receiveMonoMs: t0 + 40,
            bufferHash: "s2",
            pixelClassification: "SHUFFLE_VALID",
            geometry: { slideState: null, validate: { bottomNav: true } },
          }),
        ],
        hopTraceForHop: waapiTrace({ t0, direction: "from-right" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return (
        ev.clean === false &&
        (ev.visualClassification === "VISUAL_NO_INTERPOLATION" ||
          ev.visualClassification === "NOT_EVALUATED_INSUFFICIENT_ACTIVE_FRAMES")
      );
    },
  },
  {
    name: "7-settings-waapi-active-frames-clean",
    run: () => {
      const t0 = 2000;
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "settings",
        pointerdownMono: t0 - 50,
        frames: [
          frame({
            index: 0,
            framePresentedAtMono: t0 + 15,
            receiveMonoMs: t0 + 15,
            bufferHash: "c1",
            dSource: 3,
            dShuffle: 18,
          }),
          frame({
            index: 1,
            framePresentedAtMono: t0 + 55,
            receiveMonoMs: t0 + 55,
            bufferHash: "c2",
            dSource: 12,
            dShuffle: 9,
          }),
          frame({
            index: 2,
            framePresentedAtMono: t0 + 95,
            receiveMonoMs: t0 + 95,
            bufferHash: "c3",
            dSource: 22,
            dShuffle: 1,
          }),
        ],
        hopTraceForHop: waapiTrace({ t0 }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return ev.clean === true && ev.directionCorrect === true;
    },
  },
  {
    name: "8-loading-visible-fails",
    run: () => {
      const t0 = 2000;
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame({
            framePresentedAtMono: t0 + 20,
            receiveMonoMs: t0 + 20,
            bufferHash: "l1",
          }),
          frame({
            framePresentedAtMono: t0 + 60,
            receiveMonoMs: t0 + 60,
            bufferHash: "l2",
            pixelClassification: "LOADING",
            geometry: {
              slideState: "running",
              actualPresentedSurface: "shuffle",
              loadingShellCount: 1,
              showShuffleLoading: true,
              validate: { bottomNav: true },
            },
          }),
        ],
        hopTraceForHop: waapiTrace({ t0, direction: "from-right" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return ev.clean === false && ev.visualClassification === "VISUAL_LOADING_REAL";
    },
  },
  {
    name: "9-black-root-fails",
    run: () => {
      const t0 = 2000;
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame({
            framePresentedAtMono: t0 + 20,
            receiveMonoMs: t0 + 20,
            bufferHash: "k1",
          }),
          frame({
            framePresentedAtMono: t0 + 60,
            receiveMonoMs: t0 + 60,
            bufferHash: "k2",
            pixelClassification: "BLACK_OR_ROOT",
            geometry: {
              slideState: "running",
              actualPresentedSurface: "none",
              validate: { bottomNav: true },
            },
          }),
        ],
        hopTraceForHop: waapiTrace({ t0, direction: "from-right" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return ev.clean === false && ev.blackRootReal > 0;
    },
  },
  {
    name: "10-route-mismatch-fails",
    run: () => {
      const t0 = 2000;
      const ev = evaluateVisualSpotCheckHop({
        sourceTab: "chats",
        pointerdownMono: t0 - 50,
        frames: [
          frame({
            framePresentedAtMono: t0 + 20,
            receiveMonoMs: t0 + 20,
            bufferHash: "m1",
          }),
          frame({
            framePresentedAtMono: t0 + 2000,
            receiveMonoMs: t0 + 2000,
            deltaFromPointerMs: 2050,
            bufferHash: "m2",
            pixelClassification: "SOURCE_VALID",
            geometry: {
              slideState: null,
              actualPresentedSurface: "chats",
              routePresentationMismatch: true,
              validate: { bottomNav: true },
            },
          }),
        ],
        hopTraceForHop: waapiTrace({ t0, direction: "from-right" }),
        bridgeAudit: { bridgeOwnerNotPresentableFrameCount: 0 },
      });
      return ev.clean === false;
    },
  },
];

const invariants = {
  VISUAL_DEDUPE_NOT_TIMESTAMP_ONLY: true,
  SAME_TIMESTAMP_DISTINCT_IMAGES_RETAINED: true,
  CAPTURE_UNDERSAMPLE_NOT_PRODUCT_SNAP: true,
  VISUAL_NO_INTERPOLATION_REQUIRES_ACTIVE_FRAMES: true,
  SCREENSHOT_BURST_HAS_MONO_TIMESTAMPS: true,
  VISUAL_GATE_DOES_NOT_FAKE_CLEAN: true,
  LOADING_BLACK_MISMATCH_STILL_FAIL: true,
  WAAPI_BOUNDS_DEFINE_ACTIVE_WINDOW: true,
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
      if (failures.length < 12) failures.push({ case: c.name, error: String(e) });
    }
    if (ok) pass += 1;
    else {
      fail += 1;
      if (!failures.find((f) => f.case === c.name)) failures.push({ case: c.name, i });
    }
  }
}

invariants.VISUAL_DEDUPE_NOT_TIMESTAMP_ONLY = cases[0].run() && cases[1].run();
invariants.SAME_TIMESTAMP_DISTINCT_IMAGES_RETAINED = cases[0].run();
invariants.CAPTURE_UNDERSAMPLE_NOT_PRODUCT_SNAP = cases[2].run();
invariants.VISUAL_NO_INTERPOLATION_REQUIRES_ACTIVE_FRAMES = cases[2].run();
invariants.SCREENSHOT_BURST_HAS_MONO_TIMESTAMPS = cases[4].run();
invariants.VISUAL_GATE_DOES_NOT_FAKE_CLEAN = cases[2].run();
invariants.LOADING_BLACK_MISMATCH_STILL_FAIL = cases[7].run() && cases[8].run();
invariants.WAAPI_BOUNDS_DEFINE_ACTIVE_WINDOW = cases[6].run();

const report = {
  harness: "VISUAL_CAPTURE_PROVIDER_RELIABILITY_HARNESS",
  iterations: ITERATIONS,
  cases: cases.length,
  pass,
  fail,
  expectedPass: ITERATIONS * cases.length,
  ok: fail === 0 && Object.values(invariants).every(Boolean),
  invariants,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
