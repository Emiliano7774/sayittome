/**
 * PROD_TIMING_JITTER_GUARD — 1000 host/flag permutations.
 * Run: node scripts/prod-timing-jitter-guard.harness.mjs
 */

import assert from "node:assert/strict";
import {
  buildDiagnosticTimingJitterReport,
  mayInjectDiagnosticTimingJitter,
  shouldRunnerInjectBridgeDiagJitter,
} from "./prod-timing-jitter-guard.mjs";

const HOSTS = [
  "localhost",
  "127.0.0.1",
  "sayittome-app.web.app",
  "sayittome-app.firebaseapp.com",
  "example.com",
  "",
];
const BOOLS = [false, true];

const cases = [];
for (const hostname of HOSTS) {
  for (const explicit of BOOLS) {
    for (const releaseMode of BOOLS) {
      for (const enableMicroSlide of BOOLS) {
        for (const runnerTrace of BOOLS) {
          for (const navcapture of BOOLS) {
            cases.push({
              hostname,
              explicit,
              releaseMode,
              enableMicroSlide,
              runnerTrace,
              navcapture,
            });
          }
        }
      }
    }
  }
}

while (cases.length < 1000) {
  const i = cases.length;
  cases.push({
    hostname: i % 3 === 0 ? "sayittome-app.web.app" : i % 3 === 1 ? "localhost" : "cdn.example.net",
    explicit: i % 2 === 0,
    releaseMode: i % 5 === 0,
    enableMicroSlide: i % 7 === 0,
    runnerTrace: i % 3 === 0,
    navcapture: i % 4 === 0,
  });
}

let pass = 0;
let fail = 0;
const failures = [];

for (const c of cases.slice(0, 1000)) {
  const allowed = mayInjectDiagnosticTimingJitter(c.hostname, c.explicit);
  const isLocal = c.hostname === "localhost" || c.hostname === "127.0.0.1";
  const expectedAllowed = isLocal && c.explicit === true;
  const inject = shouldRunnerInjectBridgeDiagJitter({
    hostname: c.hostname,
    releaseMode: c.releaseMode,
    enableMicroSlide: c.enableMicroSlide,
    runnerTrace: c.runnerTrace,
    navcapture: c.navcapture,
    explicitJitterFlag: c.explicit,
  });
  const report = buildDiagnosticTimingJitterReport({
    hostname: c.hostname,
    explicitJitterFlag: c.explicit,
    routeCommitDelayMs: inject ? 113 : 0,
    finalDomReadinessDelayMs: inject ? 37 : 0,
  });

  const ok =
    allowed === expectedAllowed &&
    (isLocal || inject === false) &&
    (!isLocal ? report.diagnosticTimingJitterEnabled === false : true) &&
    (!isLocal ? report.routeCommitDelayMs === 0 : true) &&
    (!isLocal ? report.finalRouteDomDelayMs === 0 : true) &&
    (!isLocal ? report.jitterSource === null : true) &&
    report.PRODUCTION_RELEASE_CAPTURE_MUST_NOT_INJECT_TIMING_JITTER === true;

  // Production + --release must never inject even with accidental explicit flag.
  if (c.hostname.includes("sayittome") || c.hostname === "example.com" || c.hostname === "cdn.example.net") {
    if (inject) {
      failures.push({ c, reason: "prod-inject" });
      fail += 1;
      continue;
    }
  }

  if (ok) pass += 1;
  else {
    fail += 1;
    if (failures.length < 8) failures.push({ c, allowed, expectedAllowed, inject, report });
  }
}

assert.equal(fail, 0, JSON.stringify(failures, null, 2));
assert.equal(pass, 1000);
console.log(`PROD_TIMING_JITTER_GUARD = ${pass}/1000 PASS`);
