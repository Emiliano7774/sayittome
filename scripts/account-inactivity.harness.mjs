import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addCalendarMonthsUtc,
  inactivityDecision,
  nextInactivityCheckpointMs,
  resolveLastActivityMs,
} from "../functions/src/accountInactivityCore.ts";

function utc(value) {
  return Date.parse(value);
}

assert.equal(
  addCalendarMonthsUtc(utc("2026-01-31T12:34:56.789Z")),
  utc("2026-07-31T12:34:56.789Z"),
);
assert.equal(
  addCalendarMonthsUtc(utc("2026-08-31T01:02:03.004Z")),
  utc("2027-02-28T01:02:03.004Z"),
);
assert.equal(
  addCalendarMonthsUtc(utc("2027-08-31T01:02:03.004Z")),
  utc("2028-02-29T01:02:03.004Z"),
);

const last = resolveLastActivityMs(
  {
    lastActiveAt: new Date("2026-09-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  { lastSignInTime: "2026-08-31T23:59:59Z" },
);
assert.equal(last, utc("2026-09-01T00:00:00Z"));

const due = addCalendarMonthsUtc(last);
assert.equal(inactivityDecision({ lastActivityMs: last, nowMs: due - 1 }).expired, false);
assert.equal(inactivityDecision({ lastActivityMs: last, nowMs: due }).expired, true);
const now = utc("2026-09-12T09:00:00Z");
const farDue = utc("2027-03-12T09:00:00Z");
assert.equal(
  nextInactivityCheckpointMs({ dueAtMs: farDue, nowMs: now }),
  now + 28 * 24 * 60 * 60 * 1000,
);
assert.equal(
  nextInactivityCheckpointMs({ dueAtMs: now + 60_000, nowMs: now }),
  now + 60_000,
);

const policy = readFileSync(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8");
assert.match(policy, /six calendar\s+months/i);
assert.match(policy, /automatically scheduled for deletion/i);

const worker = readFileSync(new URL("../functions/src/accountInactivity.ts", import.meta.url), "utf8");
for (const required of [
  "deleteUser(uid)",
  "recursiveDelete(firestore.collection(\"usuarios\").doc(uid))",
  "anon_abuse_chat_leases",
  "viewOnceSecrets",
  "collectionGroup(\"siguiendo\")",
]) assert.ok(worker.includes(required), `missing ${required}`);

console.log("account-inactivity PASS");
