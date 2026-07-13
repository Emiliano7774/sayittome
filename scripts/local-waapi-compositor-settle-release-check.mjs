/**
 * LOCAL_WAAPI_COMPOSITOR_AND_SETTLE_RELEASE_CHECK — 8/8
 */
import fs from "node:fs";
import path from "node:path";
import { simulateWaapiCompositorSlide } from "./waapi-compositor-slide.mjs";
import { evaluateWaapiCompositorPhysicalEvidence } from "./waapi-compositor-lifecycle-evidence.mjs";
import { reduceWaapiTerminalState } from "./waapi-settle-terminal-state.mjs";

const outDir = process.argv[2] || "scripts/ghost-filmstrip-out/waapi-compositor-settle-check";
fs.mkdirSync(outDir, { recursive: true });

function baseEvents(extra = []) {
  return [
    { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED" },
    { kind: "MICRO_SLIDE_WAAPI_KEYFRAMES_PREPARED" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_READY" },
    { kind: "MICRO_SLIDE_WAAPI_ANIMATION_STARTED" },
    ...extra,
  ];
}

const cases = [
  {
    name: "1-normal-history-waapi-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({});
      return { pass: r.releaseClean === true && r.physicalSatisfied === true, detail: r.primaryFailureClass };
    },
  },
  {
    name: "2-waapi-watchdog-promoted-finish-clean",
    run: () => {
      const hopTrace = baseEvents([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED", note: "waapi-watchdog-promoted-finish" },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED" },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED" },
        { kind: "SETTLED", note: "waapi-watchdog-promoted-finish" },
      ]);
      const ev = evaluateWaapiCompositorPhysicalEvidence({
        engineSlideOccurred: true,
        domSlideOccurred: true,
        hopTrace,
        settleReason: "waapi-watchdog-promoted-finish",
        bridgeCompleted: true,
        pinCleared: true,
      });
      return {
        pass: ev.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED === true || ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true,
        detail: ev.primaryFailureClass,
      };
    },
  },
  {
    name: "3-late-cancel-after-physical-clean",
    run: () => {
      const hopTrace = baseEvents([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED" },
        { kind: "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED" },
        { kind: "MICRO_SLIDE_WAAPI_PHYSICAL_EVIDENCE_SATISFIED" },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CANCELLED", reason: "fill-release" },
        { kind: "SETTLED", note: "waapi-finish" },
      ]);
      const terminal = reduceWaapiTerminalState(hopTrace);
      const ev = evaluateWaapiCompositorPhysicalEvidence({
        engineSlideOccurred: true,
        domSlideOccurred: true,
        hopTrace,
        settleReason: "waapi-finish",
        bridgeCompleted: true,
        pinCleared: true,
      });
      const physical =
        ev.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED === true ||
        ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === true ||
        terminal?.physicalSatisfied === true;
      return { pass: physical === true, detail: { primary: ev.primaryFailureClass, terminal } };
    },
  },
  {
    name: "4-cancel-before-physical-not-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({ cancelBeforeFinish: true });
      return {
        pass: r.releaseClean === false && String(r.primaryFailureClass || "").includes("CANCEL"),
        detail: r.primaryFailureClass,
      };
    },
  },
  {
    name: "5-waapi-rejected-not-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({ rejectFinish: true });
      return { pass: r.releaseClean === false, detail: r.primaryFailureClass };
    },
  },
  {
    name: "6-waapi-unavailable-not-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({ animateAvailable: false });
      return {
        pass:
          r.releaseClean === false &&
          String(r.primaryFailureClass || "").includes("UNAVAILABLE"),
        detail: r.primaryFailureClass,
      };
    },
  },
  {
    name: "7-logical-settle-without-finish-not-clean",
    run: () => {
      const hopTrace = [
        { kind: "MICRO_SLIDE_WAAPI_MOTOR_SELECTED" },
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_CREATED" },
        { kind: "SETTLED", note: "post-transition-start-end-watchdog" },
      ];
      const ev = evaluateWaapiCompositorPhysicalEvidence({
        engineSlideOccurred: true,
        domSlideOccurred: true,
        hopTrace,
        settleReason: "post-transition-start-end-watchdog",
        bridgeCompleted: true,
        pinCleared: true,
      });
      return {
        pass:
          ev.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED !== true &&
          ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID !== true,
        detail: ev.primaryFailureClass,
      };
    },
  },
  {
    name: "8-final-styles-missing-not-clean",
    run: () => {
      const hopTrace = baseEvents([
        { kind: "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED" },
        { kind: "SETTLED", note: "waapi-finish" },
      ]);
      const ev = evaluateWaapiCompositorPhysicalEvidence({
        engineSlideOccurred: true,
        domSlideOccurred: true,
        hopTrace,
        settleReason: "waapi-finish",
        bridgeCompleted: true,
        pinCleared: true,
      });
      return {
        pass:
          ev.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED !== true &&
          ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID !== true,
        detail: ev.primaryFailureClass,
      };
    },
  },
];

const results = cases.map((c) => {
  let pass = false;
  let detail = null;
  try {
    const r = c.run();
    pass = r.pass === true;
    detail = r.detail ?? null;
  } catch (e) {
    pass = false;
    detail = String(e);
  }
  return { name: c.name, pass, detail };
});

const report = {
  check: "LOCAL_WAAPI_COMPOSITOR_AND_SETTLE_RELEASE_CHECK",
  attempted: results.length,
  pass: results.filter((r) => r.pass).length,
  ok: results.every((r) => r.pass),
  results,
};
fs.writeFileSync(path.join(outDir, "waapi-compositor-settle-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
