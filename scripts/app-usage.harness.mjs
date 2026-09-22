/**
 * APP_USAGE — day buckets in Argentina time, clamped foreground time, no double sessions.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const usage = await import(pathToFileURL(path.join(root, "src/lib/usage/appUsage.ts")).href);

assert.equal(usage.usageDayKey(new Date("2026-09-23T02:30:00.000Z")), "2026-09-22");
assert.equal(usage.usageDayKey(new Date("2026-09-23T03:30:00.000Z")), "2026-09-23");
assert.equal(usage.shiftUsageDayKey("2026-09-01", -1), "2026-08-31");
assert.deepEqual(usage.recentUsageDayKeys("2026-09-03", 3), [
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
]);
assert.equal(usage.clampUsageVisibleMs(999_999), usage.USAGE_PING_MAX_MS);
assert.equal(usage.clampUsageVisibleMs(-5), 0);

const first = usage.applyUsagePing(null, {
  nowIso: "2026-09-22T15:00:00.000Z",
  visibleMs: 60_000,
  sessionStart: true,
  username: "Ada",
  uid: "uid_ada",
  anonymous: false,
});
assert.equal(first.sessions, 1);
assert.equal(first.visibleMs, 60_000);
assert.equal(first.username, "Ada");

const burst = usage.applyUsagePing(first, {
  nowIso: "2026-09-22T15:00:05.000Z",
  visibleMs: 120_000,
  sessionStart: true,
  username: "Ada",
  uid: "uid_ada",
  anonymous: false,
});
assert.equal(burst.sessions, 1, "a second ping inside 20s is the same session");
assert.equal(burst.visibleMs, 70_000, "claimed time cannot exceed the wall clock since the last ping");

const later = usage.applyUsagePing(burst, {
  nowIso: "2026-09-22T15:10:00.000Z",
  visibleMs: 45_000,
  sessionStart: true,
  username: "",
  uid: "uid_ada",
  anonymous: false,
});
assert.equal(later.sessions, 2);
assert.equal(later.visibleMs, 115_000);
assert.equal(later.username, "Ada");

const summary = usage.summarizeUsageVisits([
  later,
  usage.applyUsagePing(null, {
    nowIso: "2026-09-22T15:00:00.000Z",
    visibleMs: 0,
    sessionStart: true,
    username: "",
    uid: "anon_1",
    anonymous: true,
  }),
]);
assert.equal(summary.entries, 2);
assert.equal(summary.registered, 1);
assert.equal(summary.anonymous, 1);
assert.equal(usage.formatUsageDuration(90_000), "2 min");
assert.equal(usage.formatUsageDuration(0), "0 min");

console.log(JSON.stringify({ gate: "APP_USAGE", pass: true }));
