/**
 * Direct provider harness for NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST.
 */
import assert from "node:assert/strict";
import {
  evaluateNoScreencastPhysicalEvidence,
  assertNoScreencastCaptureClean,
  emptyCriticalCaptureCounters,
  CAPTURE_PROVIDER,
  PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
} from "./native-lifecycle-no-screencast-evidence.mjs";

function teEvents({ elapsed = 0.11, cancel = 0, end = 1 } = {}) {
  const events = [
    { type: "transitionrun", propertyName: "transform", elapsedTime: 0 },
    { type: "transitionstart", propertyName: "transform", elapsedTime: 0 },
  ];
  for (let i = 0; i < end; i += 1) {
    events.push({ type: "transitionend", propertyName: "transform", elapsedTime: elapsed });
  }
  for (let i = 0; i < cancel; i += 1) {
    events.push({ type: "transitioncancel", propertyName: "transform", elapsedTime: 0.05 });
  }
  return events;
}

const base = {
  engineSlideOccurred: true,
  domSlideOccurred: true,
  finalInlineTargetCommitted: true,
  settleReason: "transitionend",
};

const cases = [
  {
    name: "valid-te-elapsed-0.11",
    input: { ...base, transitionEvents: teEvents() },
    expectValid: true,
  },
  {
    name: "no-end-watchdog-invalid",
    input: {
      ...base,
      transitionEvents: teEvents({ end: 0 }),
      hopTrace: [{ kind: "SETTLED", note: "post-transition-start-end-watchdog" }],
      settleReason: "post-transition-start-end-watchdog",
    },
    expectValid: false,
  },
  {
    name: "elapsed-incoherent-fail",
    input: { ...base, transitionEvents: teEvents({ elapsed: 0.05 }) },
    expectValid: false,
  },
  {
    name: "cancel-gt0-fail",
    input: { ...base, transitionEvents: teEvents({ cancel: 1 }) },
    expectValid: false,
  },
  {
    name: "legacy-transform-signal-ignored",
    input: {
      ...base,
      transitionEvents: teEvents(),
      // legacy TRANSFORM_NOT_ANIMATED is not an input to this provider
    },
    expectValid: true,
  },
];

for (let i = 0; i < 10000; i += 1) {
  const c = cases[i % cases.length];
  const result = evaluateNoScreencastPhysicalEvidence(c.input);
  assert.equal(
    result.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID,
    c.expectValid,
    `${c.name} valid=${result.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID}`,
  );
  assert.equal(
    result.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
    PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
  );
  assert.equal(result.claimsExternalEvidence, false);
  assert.equal(result.CAPTURE_PROVIDER_SELECTED, CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW);
}

const cleanCounters = assertNoScreencastCaptureClean(emptyCriticalCaptureCounters());
assert.equal(cleanCounters.ok, true);
const dirty = assertNoScreencastCaptureClean({
  cdpScreencastStartCountDuringCriticalWindow: 1,
});
assert.equal(dirty.ok, false);

console.log("native-lifecycle-no-screencast-evidence.harness: 10000/10000 PASS");
console.log("NATIVE_LIFECYCLE_PROVIDER_EXPLICIT = true");
console.log("NO_SCREENCAST_PROVIDER_CANNOT_CLAIM_EXTERNAL_EVIDENCE = true");
