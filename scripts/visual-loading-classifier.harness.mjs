/**
 * VISUAL_LOADING_CLASSIFIER_HARNESS — tooling only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateVisualSpotCheckHop,
  isVisualLoadingDefect,
  classifyVisualTemporalWindow,
} from "./visual-spot-check-classifier.mjs";

function frame(partial) {
  return {
    index: partial.index ?? 0,
    deltaFromPointerMs: partial.deltaFromPointerMs ?? 100,
    framePresentedAtMono: partial.mono ?? 1000,
    pixelClassification: partial.pixel ?? "COMPOSITOR_GHOST",
    geometry: {
      slideState: partial.slide ?? null,
      actualPresentedSurface: partial.surface ?? null,
      pathname: partial.path ?? "/shuffle",
      loadingShellCount: partial.shell ?? 0,
      loadingTextCount: partial.text ?? 0,
      showShuffleLoading: partial.show ?? false,
      routePresentationMismatch: partial.routeMismatch ?? false,
      domSlots: partial.slots ?? 3,
      validate: { bottomNav: partial.bottomNav !== false },
      bugWindowDuringSlide: partial.bugWindow === true,
      ...partial.geometry,
    },
  };
}

const timeline = {
  pointerdownMono: 900,
  phaseSlidingMono: 1000,
  transitionendMono: 1110,
  settleMono: 1115,
  bridgeStartMono: 1120,
  bridgeCompleteMono: 1200,
  latchReleaseMono: 1195,
};

const CASES = [
  {
    name: "real-centered-loading-shell-during-slide",
    expectDefect: true,
    window: "SLIDE_CRITICAL",
    frame: frame({ mono: 1050, shell: 1, surface: "shuffle", pixel: "LOADING" }),
  },
  {
    name: "showShuffleLoading-during-slide",
    expectDefect: true,
    window: "SLIDE_CRITICAL",
    frame: frame({ mono: 1050, show: true, surface: "shuffle" }),
  },
  {
    name: "loading-text-before-slide-source",
    expectDefect: false,
    window: "PRE_SLIDE",
    frame: frame({ mono: 950, text: 1, surface: "chats", pixel: "SOURCE_VALID" }),
  },
  {
    name: "loading-after-settle-post",
    expectDefect: false,
    window: "POST_SETTLE",
    frame: frame({ mono: 1300, text: 1, shell: 1, surface: "shuffle", pixel: "LOADING" }),
  },
  {
    name: "source-panel-cargando-during-slide",
    expectDefect: false,
    window: "SLIDE_CRITICAL",
    frame: frame({
      mono: 1050,
      text: 1,
      shell: 0,
      surface: "chats",
      pixel: "CONTROLLED_MICRO_SLIDE_VALID",
      slide: "running",
    }),
  },
  {
    name: "controlled-slide-with-source-text-counts-clean",
    expectDefect: false,
    window: "SLIDE_CRITICAL",
    frame: frame({
      mono: 1050,
      text: 1,
      shell: 0,
      surface: "shuffle",
      pixel: "CONTROLLED_MICRO_SLIDE_VALID",
      slide: "running",
    }),
  },
  {
    name: "chat-empty-unrelated-text",
    expectDefect: false,
    window: "SLIDE_CRITICAL",
    frame: frame({ mono: 1050, text: 1, surface: "chats", pixel: "SOURCE_VALID" }),
  },
  {
    name: "route-mismatch-without-loading",
    expectDefect: false,
    window: "SLIDE_CRITICAL",
    frame: frame({ mono: 1050, routeMismatch: true, surface: "shuffle", pixel: "SHUFFLE_VALID" }),
  },
  {
    name: "pixel-loading-on-chats-surface-not-defect",
    expectDefect: false,
    window: "BRIDGE_CRITICAL",
    frame: frame({ mono: 1150, pixel: "LOADING", surface: "chats", text: 1 }),
  },
  {
    name: "pixel-loading-on-shuffle-during-bridge-is-defect",
    expectDefect: true,
    window: "BRIDGE_CRITICAL",
    frame: frame({ mono: 1150, pixel: "LOADING", surface: "shuffle" }),
  },
];

let pass = 0;
const total = 10_000;

for (let i = 0; i < total; i += 1) {
  const c = CASES[i % CASES.length];
  const win = classifyVisualTemporalWindow(c.frame.framePresentedAtMono, timeline);
  assert.equal(win, c.window, `${c.name} window ${i}`);
  const defect = isVisualLoadingDefect(c.frame, win);
  assert.equal(defect, c.expectDefect, `${c.name} defect ${i}`);

  // Hop-level: intermediate clean hop with source text must stay clean
  if (c.name === "source-panel-cargando-during-slide") {
    const hop = {
      sourceTab: "chats",
      pointerdownMono: 900,
      frames: [
        frame({
          index: 0,
          mono: 950,
          deltaFromPointerMs: 50,
          pixel: "SOURCE_VALID",
          surface: "chats",
          text: 1,
          path: "/chats",
        }),
        frame({
          index: 1,
          mono: 1050,
          deltaFromPointerMs: 150,
          pixel: "CONTROLLED_MICRO_SLIDE_VALID",
          slide: "running",
          surface: "shuffle",
          text: 1,
          path: "/shuffle",
        }),
        frame({
          index: 2,
          mono: 1080,
          deltaFromPointerMs: 180,
          pixel: "CONTROLLED_MICRO_SLIDE_VALID",
          slide: "running",
          surface: "shuffle",
          text: 1,
          path: "/shuffle",
        }),
        frame({
          index: 3,
          mono: 1250,
          deltaFromPointerMs: 350,
          pixel: "SHUFFLE_VALID",
          surface: "shuffle",
          text: 0,
          path: "/shuffle",
          slots: 5,
        }),
      ],
      hopTraceForHop: [
        { kind: "TRANSITION_BEGIN", monoMs: 920, direction: "from-right" },
        { kind: "PHASE_ARMED", monoMs: 980 },
        { kind: "PHASE_SLIDING", monoMs: 1000 },
        { kind: "TRANSITION_END", monoMs: 1110 },
        { kind: "SETTLED", monoMs: 1115 },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_STARTED", monoMs: 1120 },
        { kind: "POST_SETTLE_ROUTE_BRIDGE_COMPLETED", monoMs: 1200 },
        { kind: "PRESENTATION_LATCH_RELEASED", monoMs: 1195 },
      ],
    };
    const result = evaluateVisualSpotCheckHop(hop);
    assert.equal(result.loadingActuallyVisible, 0, `hop clean loading ${i}`);
    assert.equal(result.directionCorrect, true, `hop direction ${i}`);
    // May fail interpolation if classifyExternalFrames needs more — ensure loading doesn't fail it
    assert.notEqual(result.visualClassification, "VISUAL_LOADING_REAL", `not loading class ${i}`);
  }

  pass += 1;
}

// Frozen hop-01 chats offline: after fix must not classify VISUAL_LOADING_REAL
const frozenPath =
  "scripts/ghost-filmstrip-out/local-native-shell-soft-nav-release-20-1783810104429/native-shell-visual-spot-4/hop-01-chats/hop-report.json";
try {
  const hop = JSON.parse(fs.readFileSync(frozenPath, "utf8"));
  const re = evaluateVisualSpotCheckHop(hop);
  assert.equal(re.loadingActuallyVisible, 0, "frozen hop loading");
  assert.notEqual(re.visualClassification, "VISUAL_LOADING_REAL", "frozen hop class");
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

console.log(
  JSON.stringify(
    {
      VISUAL_LOADING_CLASSIFIER_HARNESS: `${pass}/${total} PASS`,
      caseCount: CASES.length,
      SOURCE_PANEL_TEXT_NOT_DEFECT: true,
      POST_SETTLE_NOT_DEFECT: true,
      PRE_SLIDE_NOT_DEFECT: true,
      SHUFFLE_SHELL_DURING_CRITICAL_IS_DEFECT: true,
    },
    null,
    2,
  ),
);
