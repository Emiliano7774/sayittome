const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/usage/appUsage.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cjs = { exports: {} };
vm.runInNewContext(output, { exports: cjs.exports, module: cjs });
const u = cjs.exports;

function ping(previous, uid, anonymous, visibleMs, sessionStart, nowIso) {
  return u.applyUsagePing(previous, {
    uid, anonymous, visibleMs, sessionStart, username: anonymous ? "" : "test",
    nowIso,
  });
}
const t0 = "2026-10-08T08:00:00.000Z";
const t1 = "2026-10-08T08:01:00.000Z";
const first = ping(null, "a", false, 0, true, t0);
let daily = u.advanceUsageDaySummary(null, null, first);
assert.equal(daily.entries, 1);
assert.equal(daily.registered, 1);
assert.equal(daily.sessions, 1);
assert.equal(daily.measuredEntries, 1);
assert.equal(daily.timedEntries, 0);

const next = ping(first, "a", false, 60000, false, t1);
daily = u.advanceUsageDaySummary(daily, first, next);
assert.equal(daily.entries, 1);
assert.equal(daily.timedEntries, 1);
assert.equal(daily.totalVisibleMs, 60000);
assert.equal(daily.averageVisibleMs, 60000);
const anon = ping(null, "b", true, 45000, true, t1);
daily = u.advanceUsageDaySummary(daily, null, anon);
assert.equal(daily.entries, 2);
assert.equal(daily.anonymous, 1);
assert.equal(daily.registered, 1);
assert.equal(daily.sessions, 2);
assert.equal(daily.totalVisibleMs, 105000);
assert.equal(daily.averageVisibleMs, 52500);

const again = ping(next, "a", false, 5000, false, "2026-10-08T08:01:05.000Z");
daily = u.advanceUsageDaySummary(daily, next, again);
assert.equal(daily.totalVisibleMs, 110000);
assert.equal(daily.entries, 2);
assert.equal(daily.timedEntries, 2);
const parent = u.readUsageDaySummary({ ...daily });
assert.equal(parent.totalVisibleMs, daily.totalVisibleMs);
assert.equal(parent.entries, daily.entries);

const route = fs.readFileSync("src/app/api/usage/ping/route.ts", "utf8");
assert.ok(!route.includes("limit(500)"), "read-amplifying collection query remains");
assert.ok(!route.includes("siblings"), "daywide scan remains");
assert.ok(route.includes("tx.get(dayRef)"), "daily summary transaction read missing");
console.log("PASS usage rollup: first visit, repeat, anon, time, sessions, parent re-read, no 500-document query");
