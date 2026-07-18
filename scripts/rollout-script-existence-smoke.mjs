/**
 * Pre-rollout smoke: required gate scripts must exist (prevents *-guard* mis-invoke).
 *   node scripts/rollout-script-existence-smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "scripts/direct-cold-boost-source.harness.mjs",
  "scripts/tab-route-content-consistency.harness.mjs",
  "scripts/profile-route-main-tab-isolation.harness.mjs",
  "scripts/chat-unread-badge.harness.mjs",
  "scripts/chat-anon-recipient-unread.harness.mjs",
  "scripts/chat-bidirectional-unread-sound.harness.mjs",
  "scripts/chat-profile-recipient-sound.harness.mjs",
  "scripts/chats-to-shuffle-warm-no-reload.harness.mjs",
  "scripts/android-profile-to-shuffle-isolation.harness.mjs",
  "scripts/bidirectional-tab-no-loading-local-probe.mjs",
  "scripts/post-arrival-shuffle-flash-local-probe.mjs",
  "scripts/monitor-prod-staged-rollout.mjs",
  "scripts/verify-prod-delivery-snap.mjs",
];
const forbiddenAliases = [
  "scripts/direct-cold-boost-source-guard.harness.mjs",
];

const missing = required.filter((p) => !fs.existsSync(path.join(root, p)));
const badAliases = forbiddenAliases.filter((p) =>
  fs.existsSync(path.join(root, p)),
);

const pass = missing.length === 0 && badAliases.length === 0;
const out = {
  gate: "ROLLOUT_SCRIPT_EXISTENCE_SMOKE",
  pass,
  required,
  missing,
  forbiddenAliasesPresent: badAliases,
  note: "Use direct-cold-boost-source.harness.mjs (not *-guard*).",
};
console.log(JSON.stringify(out, null, 2));
process.exit(pass ? 0 : 1);
