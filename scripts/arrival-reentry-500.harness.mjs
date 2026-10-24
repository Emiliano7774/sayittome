import assert from "node:assert/strict";
import { consumeAnonArrivalToastOnce } from "../src/lib/anonMatch/arrivalToastReceipt.ts";
import { mayAnnounceRegisteredReturn } from "../functions/src/profileArrivalPolicy.ts";
import { isNewAnonymousArrival } from "../src/lib/anonMatch/anonArrival.ts";

// Simulate 500 independent valid reconnects by the SAME person, each 61 seconds apart.
const start = Date.now();
const alias = "anon_repeated_123456";
for (let i = 0; i < 500; i++) {
  const now = start + i * 61_000;
  const enteredAt = new Date(now).toISOString();
  assert.equal(consumeAnonArrivalToastOnce("viewer1", alias, enteredAt, now), true, "reentry " + i);
  assert.equal(consumeAnonArrivalToastOnce("viewer1", alias, enteredAt, now + 100), false, "retry " + i);
  const previousAt = i > 0 ? new Date(now - 61_000).toISOString() : "";
  assert.equal(isNewAnonymousArrival({
    nowMs: now, priorLastSeenAt: previousAt, priorAnnouncedAt: previousAt, priorBackgrounded: true,
  }), true, "server anon arrival " + i);
  assert.equal(mayAnnounceRegisteredReturn({
    nowMs: now, lastForegroundMs: i ? now - 61_000 : 0,
    lastAnnouncementMs: i ? now - 61_000 : 0,
  }), true, "server profile arrival " + i);
}
const shortGapAt = start + 499*61_000 + 59_000;
assert.equal(consumeAnonArrivalToastOnce("viewer1", alias, new Date(shortGapAt).toISOString(), shortGapAt), false, "short gap");
console.log("PASS: 500 anon and profile reconnects after >=60 seconds, unique toast per event, duplicate retry suppressed");
