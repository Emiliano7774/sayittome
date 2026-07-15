/**
 * Orchestrate full local release probes for direct-cold boost source fix.
 * Usage:
 *   node scripts/run-flr-direct-cold-boost-source.mjs --root <artifactRoot> --base http://127.0.0.1:3010
 *   node scripts/run-flr-direct-cold-boost-source.mjs --root <dir> --base <url> --skip-until fase5-internal-sb-x20
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const root = argValue("--root");
const base = argValue("--base") || "http://127.0.0.1:3010";
const skipUntil = argValue("--skip-until");
if (!root) {
  console.error("need --root");
  process.exit(1);
}
fs.mkdirSync(root, { recursive: true });

const results = {};
let skipping = Boolean(skipUntil);

function writeJson(name, obj) {
  fs.writeFileSync(path.join(root, name), JSON.stringify(obj, null, 2));
}

function parseJsonBlob(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start));
  } catch {
    return null;
  }
}

function summarizeProbeDir(dir) {
  for (const name of [
    "fresh-anon-8dir-summary.json",
    "logged-in-8dir-summary.json",
  ]) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const dirs = j.directions || [];
    const clean = dirs.filter((d) =>
      String(d.classification || "").includes("CLEAN"),
    ).length;
    const mid = dirs.filter(
      (d) => Number(d.midLoadingAfterRevealCount || 0) > 0,
    ).length;
    return {
      pass: clean === dirs.length && mid === 0,
      clean,
      total: dirs.length,
      midFail: mid,
      summary: p,
    };
  }
  return { pass: false, reason: "summary missing" };
}

function run(name, cmd, cmdArgs, opts = {}) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  fs.writeFileSync(path.join(root, `${name}.log`), out);
  const pass = r.status === 0;
  results[name] = { pass, status: r.status };
  console.log(pass ? `PASS ${name}` : `FAIL ${name} exit=${r.status}`);
  if (!pass && opts.failClosed !== false) {
    writeJson("FLR_ABORT.json", { failedPhase: name, results });
    process.exit(r.status || 1);
  }
  return { pass, out, status: r.status };
}

function phase(name, fn) {
  if (skipping) {
    if (name === skipUntil) skipping = false;
    else {
      console.log(`SKIP ${name}`);
      return;
    }
  }
  fn();
}

phase("fase4-direct-cold-x30", () => {
  const r = run("fase4-direct-cold-x30", process.execPath, [
    "scripts/direct-cold-boost-chats-prepaint-check.mjs",
    "--base",
    base,
    "--repeat",
    "30",
  ]);
  const j = parseJsonBlob(r.out);
  writeJson("fase4-direct-cold.json", j || { pass: false });
  if (!j?.pass || !j?.boostPass) {
    console.error("DIRECT_COLD_FAILED", j);
    process.exit(1);
  }
});

phase("fase5-internal-sb-x20", () => {
  const outDir = path.join(root, "fase5-internal-sb-x20");
  run("fase5-internal-sb-x20", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    outDir,
    "--only",
    "shuffle:boost",
    "--repeat",
    "20",
  ]);
  const sum = summarizeProbeDir(outDir);
  writeJson("fase5-internal-sb.json", sum);
  if (!sum.pass) process.exit(1);
});

phase("fase6-live-harness", () => {
  const r = run("fase6-live-harness", process.execPath, [
    "scripts/direct-cold-boost-source.harness.mjs",
    "--live",
    "--base",
    base,
  ]);
  writeJson("fase6-live-harness.json", parseJsonBlob(r.out) || { pass: r.pass });
  if (!r.pass) process.exit(1);
});

phase("fase7-targeted-3hop-x20", () => {
  const outDir = path.join(root, "fase7-targeted-3hop-x20");
  run("fase7-targeted-3hop-x20", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    outDir,
    "--only",
    "chats:shuffle,shuffle:chats,shuffle:boost",
    "--repeat",
    "20",
  ]);
  const sum = summarizeProbeDir(outDir);
  writeJson("fase7-targeted.json", sum);
  if (!sum.pass) process.exit(1);
});

phase("fase8-fresh-8dir-x10", () => {
  const outDir = path.join(root, "fase8-fresh-8dir-x10");
  run("fase8-fresh-8dir-x10", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    outDir,
    "--repeat",
    "10",
  ]);
  const sum = summarizeProbeDir(outDir);
  writeJson("fase8-fresh.json", sum);
  if (!sum.pass) process.exit(1);
});

phase("fase9-logged-8dir-x5", () => {
  const outDir = path.join(root, "fase9-logged-8dir-x5");
  run("fase9-logged-8dir-x5", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    outDir,
    "--logged-in",
    "--repeat",
    "5",
  ]);
  const sum = summarizeProbeDir(outDir);
  writeJson("fase9-logged.json", sum);
  if (!sum.pass) process.exit(1);
});

phase("fase10-remount", () => {
  run("fase10-boost-remount-x10", process.execPath, [
    "scripts/prepaint-boost-remount-race-gate.mjs",
    "--base",
    base,
    "--repeat",
    "10",
  ]);
  const chatsRace = "scripts/prepaint-chats-remount-race-gate.mjs";
  if (fs.existsSync(chatsRace)) {
    run("fase10-chats-remount-x10", process.execPath, [
      chatsRace,
      "--base",
      base,
      "--repeat",
      "10",
    ]);
  } else {
    const outDir = path.join(root, "fase10-chats-sc-isolated-x20");
    run("fase10-chats-sc-isolated-x20", process.execPath, [
      "scripts/bidirectional-tab-no-loading-local-probe.mjs",
      "--base",
      base,
      "--out",
      outDir,
      "--only",
      "shuffle:chats",
      "--repeat",
      "20",
    ]);
    const sum = summarizeProbeDir(outDir);
    writeJson("fase10-chats-remount-na.json", {
      na: true,
      reason: "prepaint-chats-remount-race-gate.mjs unavailable",
      substitute: sum,
    });
    if (!sum.pass) process.exit(1);
  }
});

for (const [name, only, repeat] of [
  ["fase11-isolated-sb-x20", "shuffle:boost", "20"],
  ["fase11-isolated-bs-x20", "boost:shuffle", "20"],
  ["fase11-isolated-sc-x20", "shuffle:chats", "20"],
  ["fase11-isolated-cs-x20", "chats:shuffle", "20"],
  ["fase11-pingpong-sb-bs-x20", "shuffle:boost,boost:shuffle", "20"],
  ["fase11-pingpong-sc-cs-x20", "shuffle:chats,chats:shuffle", "20"],
]) {
  phase(name, () => {
    const outDir = path.join(root, name);
    run(name, process.execPath, [
      "scripts/bidirectional-tab-no-loading-local-probe.mjs",
      "--base",
      base,
      "--out",
      outDir,
      "--only",
      only,
      "--repeat",
      repeat,
    ]);
    const sum = summarizeProbeDir(outDir);
    writeJson(`${name}.json`, sum);
    if (!sum.pass) process.exit(1);
  });
}

phase("fase12-bidirectional", () => {
  const freshDir = path.join(root, "fase12-bidirectional-fresh");
  run("fase12-bidirectional-fresh", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    freshDir,
    "--repeat",
    "1",
  ]);
  const f = summarizeProbeDir(freshDir);
  writeJson("fase12-fresh.json", f);
  if (!f.pass) process.exit(1);

  const loggedDir = path.join(root, "fase12-bidirectional-logged");
  run("fase12-bidirectional-logged", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    loggedDir,
    "--logged-in",
    "--repeat",
    "1",
  ]);
  const l = summarizeProbeDir(loggedDir);
  writeJson("fase12-logged.json", l);
  if (!l.pass) process.exit(1);
});

phase("fase13-native-smoke", () => {
  const chromeOut = path.join(root, "fase13-native-chrome");
  run("fase13-native-chrome", process.execPath, [
    "scripts/bidirectional-native-shell-release-20.mjs",
    "--base",
    base,
    "--out",
    chromeOut,
    "--chrome",
  ]);
  const chromiumOut = path.join(root, "fase13-native-chromium");
  run("fase13-native-chromium", process.execPath, [
    "scripts/bidirectional-native-shell-release-20.mjs",
    "--base",
    base,
    "--out",
    chromiumOut,
  ]);
  if (fs.existsSync("scripts/local-post-gate-smoke-2.mjs")) {
    run(
      "fase13-smoke-2",
      process.execPath,
      ["scripts/local-post-gate-smoke-2.mjs", "--base", base],
      { failClosed: false },
    );
  }
  const smokeDir = path.join(root, "fase13-smoke-24");
  run("fase13-smoke-24", process.execPath, [
    "scripts/bidirectional-tab-no-loading-local-probe.mjs",
    "--base",
    base,
    "--out",
    smokeDir,
    "--repeat",
    "3",
  ]);
  const s = summarizeProbeDir(smokeDir);
  writeJson("fase13-smoke-24.json", s);
  if (!s.pass) process.exit(1);
});

phase("fase14-direct-cold-preservation", () => {
  const r = run("fase14-direct-cold-preservation", process.execPath, [
    "scripts/direct-cold-boost-chats-prepaint-check.mjs",
    "--base",
    base,
    "--repeat",
    "5",
  ]);
  const j = parseJsonBlob(r.out);
  writeJson("fase14-direct-cold-preservation.json", j || { pass: r.pass });
  if (!j?.pass) process.exit(1);
});

phase("fase15-history", () => {
  if (fs.existsSync("scripts/local-native-history-commit-back-forward-check.mjs")) {
    run(
      "fase15-history",
      process.execPath,
      [
        "scripts/local-native-history-commit-back-forward-check.mjs",
        "--base",
        base,
      ],
      { failClosed: false },
    );
  } else {
    writeJson("fase15-history.json", { na: true });
  }
});

phase("fase16-harnesses", () => {
  run("fase16-harness-direct-cold-source", process.execPath, [
    "scripts/direct-cold-boost-source.harness.mjs",
    "--live",
    "--base",
    base,
  ]);
  run("fase16-harness-boost-prepaint", process.execPath, [
    "scripts/prepaint-boost-remount-suppress.harness.mjs",
  ]);
  run("fase16-harness-chats-prepaint", process.execPath, [
    "scripts/prepaint-chats-remount-suppress.harness.mjs",
  ]);
});

phase("fase17-reprocess", () => {
  run("fase17-reprocess-direct-cold", process.execPath, [
    "scripts/reprocess-direct-cold-boost-source-rollout.mjs",
    root,
  ]);
  run("fase17-reprocess-shuffle-boost", process.execPath, [
    "scripts/reprocess-prepaint-boost-shuffle-boost-rollout.mjs",
    root,
  ]);
  run(
    "fase17-reprocess-chats",
    process.execPath,
    ["scripts/reprocess-prepaint-chats-remount-rollout.mjs", root],
    { failClosed: false },
  );
  if (
    fs.existsSync(
      "scripts/reprocess-targeted-shuffle-chats-flag-desync-rollout.mjs",
    )
  ) {
    run(
      "fase17-reprocess-flag-desync",
      process.execPath,
      [
        "scripts/reprocess-targeted-shuffle-chats-flag-desync-rollout.mjs",
        root,
      ],
      { failClosed: false },
    );
  }
});

// Ensure fase4 json is correct if we skipped it
if (
  skipUntil &&
  fs.existsSync(path.join(root, "fase4-direct-cold-x30.log")) &&
  (!fs.existsSync(path.join(root, "fase4-direct-cold.json")) ||
    !JSON.parse(fs.readFileSync(path.join(root, "fase4-direct-cold.json"), "utf8")).boostPass)
) {
  const j = parseJsonBlob(
    fs.readFileSync(path.join(root, "fase4-direct-cold-x30.log"), "utf8"),
  );
  if (j) writeJson("fase4-direct-cold.json", j);
}

writeJson("flr-phase-results.json", results);
console.log("\nFLR_MATRIX_CORE_PASS");
process.exit(0);
