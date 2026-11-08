import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);
const fromSrc = (p) => import(pathToFileURL(path.join(root, "src", p)).href);
const { formatLastSeenLocalized } = await fromSrc("lib/i18n/formatLastSeen.ts");
const { resolveProfileLastSeenLabel } = await fromSrc("lib/profile/resolveProfileLastSeenLabel.ts");
const { resolveProfileHeartbeat } = await fromSrc("lib/profile/lastSeenVisibility.ts");
const { SHUFFLE_REGISTERED_ONLINE_WINDOW_MS } = await fromSrc("lib/presence.ts");
const { ANON_SHUFFLE_VISIBILITY_MS } = await fromSrc("lib/anonMatch/anonymousPresenceIdentity.ts");

const hours = (h) => new Date(Date.now() - h * 60 * 60_000).toISOString();
const format = (stamp, online, windowMs, labelMs) =>
  formatLastSeenLocalized("es", stamp, online, windowMs, labelMs);
const label = (h, publicPresence = true) => resolveProfileLastSeenLabel(
  { presenceAt: hours(h), mostrarUltimaVez: publicPresence }, false, format, h <= 100);
assert.equal(SHUFFLE_REGISTERED_ONLINE_WINDOW_MS, 100 * 60 * 60 * 1000);
assert.equal(ANON_SHUFFLE_VISIBILITY_MS, 3 * 60 * 60 * 1000);
for (const h of [0, 1, 2.99, 3.01, 24, 72, 99.9]) {
  assert.equal(label(h), "en línea", `registered profile after ${h}h`);
}
assert.notEqual(label(100.02), "en línea", "expired registered profile should show last seen");
assert.equal(label(99, false), "", "hidden last seen stays private");
assert.equal(
  resolveProfileHeartbeat({ presenceAt: hours(180), lastActiveAt: hours(22) }),
  resolveProfileHeartbeat({ lastActiveAt: hours(22) }),
  "newest valid heartbeat must win over stale presenceAt",
);
assert.equal(
  resolveProfileHeartbeat({ createdAt: hours(1) }),
  undefined,
  "registration/edit dates are never proof of presence",
);
assert.notEqual(format(hours(99)), "en línea", "non-profile formatters retain three-hour semantics");
console.log("PASS: public registered profiles say En línea throughout 100 hours; anon stays 3h; privacy preserved");
