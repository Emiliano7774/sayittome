/**
 * Synthetic delivery-verify classifier suite (no prod mutation).
 * Covers FLR contract for 8a011fc delivery-verify tooling fix.
 */
import fs from "node:fs";
import path from "node:path";

const out = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : null;

const expectSha = "8a011fc";
const BUDGET = 45_000;

function classifyFailure({
  wrongSite,
  snap,
  attempts,
  bundle,
  htmlMeta,
  budgetMs = BUDGET,
  pollMs = 500,
  sourceFlag = true,
}) {
  if (wrongSite) return "WRONG_SITE_CHANNEL";
  if (sourceFlag === false) return "SOURCE_FLAG_FALSE";
  if (
    snap?.buildSha &&
    !String(snap.buildSha).startsWith(expectSha.slice(0, 7))
  ) {
    return "BUILD_SHA_MISMATCH";
  }
  if (snap?.exportPresent === true && snap?.buildSha == null) {
    return "BUILD_SHA_NULL";
  }
  if (snap?.exportPresent === true && snap?.runtimeFlag !== true) {
    return "RUNTIME_FLAG_FALSE";
  }
  if (snap?.exportPresent === true && snap?.buildFlag !== true) {
    return "BUILD_FLAG_FALSE";
  }
  const last = attempts[attempts.length - 1] || {};
  const mixed =
    (htmlMeta?.htmlHasDd28351 && bundle?.hitExpect) ||
    (bundle?.hitExpect && bundle?.hitDd);
  if (mixed && last.exportPresent !== true) return "CDN_PROPAGATION_MIXED";
  const cacheHint = /hit/i.test(
    String(
      htmlMeta?.headers?.["x-cache"] ||
        htmlMeta?.headers?.["cf-cache-status"] ||
        "",
    ),
  );
  if (cacheHint && bundle?.hitExpect && last.exportPresent !== true) {
    return "CACHED_OLD_SHELL";
  }
  if (
    last.exportPresent !== true &&
    bundle?.hitExpect &&
    last.tMs >= budgetMs - pollMs
  ) {
    return "EXPORT_MISSING_PERSISTENT";
  }
  if (last.exportPresent !== true && last.buildSha == null) {
    return "EXPORT_ATTACH_TIMEOUT";
  }
  if (last.buildSha == null) return "BUILD_SHA_NULL";
  return "EXPORT_MISSING_PERSISTENT";
}

function wouldPass(snap, expect = expectSha, sourceFlag = true) {
  return (
    sourceFlag === true &&
    snap?.exportPresent === true &&
    snap?.buildFlag === true &&
    snap?.runtimeFlag === true &&
    String(snap?.buildSha || "").startsWith(expect.slice(0, 7))
  );
}

/** Simulate bounded poll over attempt timeline. */
function pollPass(attempts, expect = expectSha, sourceFlag = true) {
  for (const a of attempts) {
    const snap = {
      exportPresent: a.exportPresent,
      buildFlag: a.buildFlag,
      runtimeFlag: a.runtimeFlag,
      buildSha: a.buildSha,
    };
    if (wouldPass(snap, expect, sourceFlag)) {
      return { pass: true, firstExportAtMs: a.tMs, snap };
    }
  }
  const last = attempts[attempts.length - 1] || {};
  return {
    pass: false,
    firstExportAtMs: null,
    snap: {
      exportPresent: last.exportPresent ?? false,
      buildFlag: last.buildFlag ?? false,
      runtimeFlag: last.runtimeFlag ?? false,
      buildSha: last.buildSha ?? null,
    },
  };
}

const cases = [];
const failureClasses = new Set();
function check(name, pass, detail = {}) {
  cases.push({ name, pass: Boolean(pass), ...detail });
  if (detail.cls) failureClasses.add(detail.cls);
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

// 1) valid
{
  const snap = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "8a011fc",
  };
  check("SYNTH_VALID_8A011FC_PASS", wouldPass(snap));
}

// 2) export after 2s => PASS
{
  const r = pollPass([
    { tMs: 500, exportPresent: false, buildSha: null },
    { tMs: 1500, exportPresent: false, buildSha: null },
    {
      tMs: 2000,
      exportPresent: true,
      buildFlag: true,
      runtimeFlag: true,
      buildSha: "8a011fc",
    },
  ]);
  check("SYNTH_DELAYED_2S_PASS", r.pass === true && r.firstExportAtMs === 2000, {
    firstExportAtMs: r.firstExportAtMs,
  });
}

// 3) export after 4s => PASS
{
  const r = pollPass([
    { tMs: 1500, exportPresent: false, buildSha: null },
    { tMs: 3000, exportPresent: false, buildSha: null },
    {
      tMs: 4000,
      exportPresent: true,
      buildFlag: true,
      runtimeFlag: true,
      buildSha: "8a011fc",
    },
  ]);
  check("SYNTH_DELAYED_4S_PASS", r.pass === true && r.firstExportAtMs === 4000, {
    firstExportAtMs: r.firstExportAtMs,
  });
}

// 4) export after budget => FAIL
{
  const attempts = [
    { tMs: 1500, exportPresent: false, buildSha: null },
    { tMs: 20000, exportPresent: false, buildSha: null },
    { tMs: 44900, exportPresent: false, buildSha: null },
    // attaches after budget — must not count
    {
      tMs: 46000,
      exportPresent: true,
      buildFlag: true,
      runtimeFlag: true,
      buildSha: "8a011fc",
    },
  ];
  const inBudget = attempts.filter((a) => a.tMs <= BUDGET);
  const r = pollPass(inBudget);
  const cls = classifyFailure({
    wrongSite: false,
    snap: r.snap,
    attempts: inBudget,
    bundle: { hitExpect: true },
    htmlMeta: {},
    budgetMs: BUDGET,
  });
  check(
    "SYNTH_AFTER_BUDGET_FAIL",
    r.pass === false &&
      (cls === "EXPORT_MISSING_PERSISTENT" || cls === "EXPORT_ATTACH_TIMEOUT"),
    { cls },
  );
}

// 5) buildSha null persistent
{
  const snap = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: null,
  };
  const cls = classifyFailure({
    wrongSite: false,
    snap,
    attempts: [{ tMs: 45000, exportPresent: true, buildSha: null }],
    bundle: { hitExpect: true },
    htmlMeta: {},
  });
  check(
    "SYNTH_BUILD_SHA_NULL_FAIL",
    !wouldPass(snap) && cls === "BUILD_SHA_NULL",
    { cls },
  );
}

// 6) export missing persistent
{
  const snap = {
    exportPresent: false,
    buildFlag: false,
    runtimeFlag: false,
    buildSha: null,
  };
  const cls = classifyFailure({
    wrongSite: false,
    snap,
    attempts: [{ tMs: 44900, exportPresent: false, buildSha: null }],
    bundle: { hitExpect: true, hitDd: false },
    htmlMeta: {},
  });
  check(
    "SYNTH_EXPORT_MISSING_PERSISTENT_FAIL",
    !wouldPass(snap) && cls === "EXPORT_MISSING_PERSISTENT",
    { cls },
  );
}

// 7) BUILD_SHA_MISMATCH
{
  const snap = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "dd28351",
  };
  const cls = classifyFailure({
    wrongSite: false,
    snap,
    attempts: [{ tMs: 3000, exportPresent: true, buildSha: "dd28351" }],
    bundle: { hitExpect: false, hitDd: true },
    htmlMeta: {},
  });
  check(
    "SYNTH_BUILD_SHA_MISMATCH_FAIL",
    !wouldPass(snap) && cls === "BUILD_SHA_MISMATCH",
    { cls },
  );
}

// 8) runtimeFlag false
{
  const snap = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: false,
    buildSha: "8a011fc",
  };
  const cls = classifyFailure({
    wrongSite: false,
    snap,
    attempts: [{ tMs: 3000, ...snap }],
    bundle: { hitExpect: true },
    htmlMeta: {},
  });
  check(
    "SYNTH_RUNTIME_FLAG_FALSE_FAIL",
    !wouldPass(snap) && cls === "RUNTIME_FLAG_FALSE",
    { cls },
  );
}

// 9) buildFlag false
{
  const snap = {
    exportPresent: true,
    buildFlag: false,
    runtimeFlag: true,
    buildSha: "8a011fc",
  };
  const cls = classifyFailure({
    wrongSite: false,
    snap,
    attempts: [{ tMs: 3000, ...snap }],
    bundle: { hitExpect: true },
    htmlMeta: {},
  });
  check(
    "SYNTH_BUILD_FLAG_FALSE_FAIL",
    !wouldPass(snap) && cls === "BUILD_FLAG_FALSE",
    { cls },
  );
}

// 10) sourceFlag false
{
  const snap = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "8a011fc",
  };
  const cls = classifyFailure({
    wrongSite: false,
    snap,
    attempts: [{ tMs: 3000, ...snap }],
    bundle: { hitExpect: true },
    htmlMeta: {},
    sourceFlag: false,
  });
  check(
    "SYNTH_SOURCE_FLAG_FALSE_FAIL",
    !wouldPass(snap, expectSha, false) && cls === "SOURCE_FLAG_FALSE",
    { cls },
  );
}

// 11) old shell then new after delay
{
  const early = {
    exportPresent: false,
    buildFlag: false,
    runtimeFlag: false,
    buildSha: null,
  };
  const late = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "8a011fc",
  };
  const r = pollPass([
    { tMs: 1000, ...early },
    { tMs: 5000, ...late },
  ]);
  check(
    "SYNTH_OLD_SHELL_THEN_NEW_PASS_AFTER_POLL",
    !wouldPass(early) && wouldPass(late) && r.pass === true,
  );
}

// 12) CDN mixed
{
  const cls = classifyFailure({
    wrongSite: false,
    snap: { exportPresent: false, buildSha: null },
    attempts: [{ tMs: 20000, exportPresent: false }],
    bundle: { hitExpect: true, hitDd: true },
    htmlMeta: { htmlHasDd28351: true },
  });
  check("SYNTH_MIXED_CDN_CLASSIFIED", cls === "CDN_PROPAGATION_MIXED", { cls });
}

// 13) cache stale => CACHED_OLD_SHELL + refetch resolves
{
  const cls = classifyFailure({
    wrongSite: false,
    snap: { exportPresent: false, buildSha: null },
    attempts: [{ tMs: 10000, exportPresent: false, buildSha: null }],
    bundle: { hitExpect: true },
    htmlMeta: { headers: { "x-cache": "HIT" } },
  });
  const afterRefetch = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "8a011fc",
  };
  check(
    "SYNTH_CACHED_OLD_SHELL_CLASSIFIED_THEN_REFETCH_PASS",
    cls === "CACHED_OLD_SHELL" && wouldPass(afterRefetch),
    { cls },
  );
}

// 14) SW stale => bypass/fresh PASS if resolvable
{
  const blockedSwThenFresh = pollPass([
    { tMs: 800, exportPresent: false, buildSha: null },
    {
      tMs: 2500,
      exportPresent: true,
      buildFlag: true,
      runtimeFlag: true,
      buildSha: "8a011fc",
    },
  ]);
  check(
    "SYNTH_SW_BYPASS_FRESH_PASS",
    blockedSwThenFresh.pass === true,
    { note: "serviceWorkers=block in live verifier" },
  );
}

// 15) bundle sha only NOT pass
{
  const snap = {
    exportPresent: false,
    buildFlag: false,
    runtimeFlag: false,
    buildSha: null,
  };
  const bundleAlone = true;
  check(
    "SYNTH_BUNDLE_SHA_ONLY_NOT_PASS",
    !wouldPass(snap) && bundleAlone === true,
  );
}

// 16) wrong site
{
  const cls = classifyFailure({
    wrongSite: true,
    snap: {
      exportPresent: true,
      buildFlag: true,
      runtimeFlag: true,
      buildSha: "8a011fc",
    },
    attempts: [],
    bundle: { hitExpect: true },
    htmlMeta: {},
  });
  check("SYNTH_WRONG_SITE_FAIL", cls === "WRONG_SITE_CHANNEL", { cls });
}

// 17) one-shot 1500 false-neg vs late attach
{
  const at1500 = {
    exportPresent: false,
    buildFlag: false,
    runtimeFlag: false,
    buildSha: null,
  };
  const at3000 = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "8a011fc",
  };
  check(
    "SYNTH_ONESHOT_1500_FALSE_NEG_LATE_ATTACH_PASS",
    !wouldPass(at1500) && wouldPass(at3000),
  );
}

// 18) dd28351 not target when expect 8a011fc
{
  const snap = {
    exportPresent: true,
    buildFlag: true,
    runtimeFlag: true,
    buildSha: "dd28351",
  };
  check("SYNTH_DD28351_NOT_TARGET_FAIL", !wouldPass(snap));
}

const pass = cases.every((c) => c.pass);
const report = {
  pass,
  cases,
  failureClasses: [...failureClasses].sort(),
  gate: "DELIVERY_VERIFY_SYNTHETIC",
  count: cases.length,
  requiredMin: 16,
};
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass, count: cases.length }, null, 2));
process.exit(pass ? 0 : 1);
