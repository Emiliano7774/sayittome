/**
 * LOCAL_WAAPI_COMPOSITOR_SLIDE_RELEASE_CHECK — 6/6
 */
import fs from "node:fs";
import path from "node:path";
import { simulateWaapiCompositorSlide } from "./waapi-compositor-slide.mjs";
import { evaluateWaapiCompositorPhysicalEvidence } from "./waapi-compositor-lifecycle-evidence.mjs";

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

const cases = [
  {
    name: "1-normal-history-waapi-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({});
      return {
        pass: r.releaseClean === true && r.physicalSatisfied === true,
        primary: r.primaryFailureClass,
      };
    },
  },
  {
    name: "2-waapi-cancel-not-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({ cancelBeforeFinish: true });
      return {
        pass:
          r.releaseClean === false &&
          r.primaryFailureClass === "WAAPI_COMPOSITOR_ANIMATION_CANCELLED",
        primary: r.primaryFailureClass,
      };
    },
  },
  {
    name: "3-waapi-rejected-not-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({ rejectFinish: true });
      return {
        pass:
          r.releaseClean === false &&
          (r.primaryFailureClass === "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH" ||
            String(r.primaryFailureClass || "").includes("REJECT") ||
            r.finished === false),
        primary: r.primaryFailureClass,
      };
    },
  },
  {
    name: "4-waapi-unavailable-not-clean",
    run: () => {
      const r = simulateWaapiCompositorSlide({ animateAvailable: false });
      return {
        pass:
          r.releaseClean === false &&
          r.primaryFailureClass === "WAAPI_UNAVAILABLE_FOR_NATIVE_HISTORY_MICRO_SLIDE",
        primary: r.primaryFailureClass,
      };
    },
  },
  {
    name: "5-logical-settle-without-finish",
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
          ev.WAAPI_COMPOSITOR_PHYSICAL_EVIDENCE_VALID === false &&
          (ev.primaryFailureClass ===
            "WAAPI_COMPOSITOR_LOGICAL_SETTLE_WITHOUT_PHYSICAL_ANIMATION" ||
            ev.primaryFailureClass === "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_FINISH" ||
            ev.primaryFailureClass === "WAAPI_COMPOSITOR_ANIMATION_DID_NOT_START"),
        primary: ev.primaryFailureClass,
      };
    },
  },
  {
    name: "6-final-style-missing",
    run: () => {
      const r = simulateWaapiCompositorSlide({ commitFinalStyles: false });
      return {
        pass:
          r.releaseClean === false &&
          r.primaryFailureClass === "WAAPI_COMPOSITOR_FINAL_STYLE_COMMIT_MISSING",
        primary: r.primaryFailureClass,
      };
    },
  },
];

const results = cases.map((c) => {
  const r = c.run();
  return { name: c.name, pass: r.pass, primary: r.primary };
});
const passCount = results.filter((r) => r.pass).length;
const report = {
  LOCAL_WAAPI_COMPOSITOR_SLIDE_RELEASE_CHECK: `${passCount}/${cases.length}`,
  PASS: passCount === cases.length,
  results,
};
fs.writeFileSync(path.join(outDir, "waapi-compositor-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(passCount === cases.length ? 0 : 1);
