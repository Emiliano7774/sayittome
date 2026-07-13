/**
 * LOCAL_HISTORY_BACK_FORWARD_PIN_GUARD_RELEASE_CHECK — 10/10
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  armClickIntent,
  createGuardState,
  markPopstateRestore,
  settleAndClearPin,
  tryBeginMicroSlide,
  updateBottomNavActiveOnly,
  updateInternalPathnameOnly,
  hardNavOutsideMicro,
} from "./history-back-forward-pin-guard-core.mjs";

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

const base = 2_000_000;
const cases = [];

function push(name, pass, detail = {}) {
  cases.push({ name, pass, ...detail });
}

{
  const s = createGuardState(true);
  armClickIntent(s, "/chats", base);
  const ok = tryBeginMicroSlide(s, "user-main-tab-pointerdown", base + 1);
  push("1-user-click-valid-tx-pin", ok && !!s.activeTx?.txId && !!s.pin?.txId);
}
{
  const s = createGuardState(true);
  armClickIntent(s, "/chats", base);
  tryBeginMicroSlide(s, "user-main-tab-pointerdown", base + 1);
  settleAndClearPin(s);
  const before = s.transitionBeginCount;
  markPopstateRestore(s, base + 100);
  tryBeginMicroSlide(s, "pointerenter-warm", base + 110);
  push(
    "2-popstate-after-settle",
    s.transitionBeginCount === before && !s.pin && !s.activeTx,
  );
}
{
  const s = createGuardState(true);
  markPopstateRestore(s, base);
  const ok = tryBeginMicroSlide(s, "pointerenter-warm", base + 10);
  push("3-pointerenter-warm-after-popstate", !ok && !s.pin && s.beginBlocked >= 1);
}
{
  const s = createGuardState(true);
  armClickIntent(s, "/chats", base);
  markPopstateRestore(s, base + 5);
  push(
    "4-back-forward-restore-no-click-intent",
    s.clickIntent == null &&
      s.events.includes("HISTORY_BACK_FORWARD_RESTORE_NO_MICRO_SLIDE"),
  );
}
{
  const s = createGuardState(true);
  armClickIntent(s, "/chats", base);
  const ok = tryBeginMicroSlide(s, "user-main-tab-pointerdown", base + 1, {
    forceNullTxId: true,
  });
  push("5-tx-null-pin-blocked", !ok && s.pinBlockedNoTx >= 1 && !s.pin);
}
{
  const s = createGuardState(true);
  s.pin = { txId: null, phase: "preparing" };
  markPopstateRestore(s, base);
  push("6-stale-preparing-pin-cleared", s.pin == null && s.stalePinCleared >= 1);
}
{
  const s = createGuardState(true);
  armClickIntent(s, "/chats", base);
  tryBeginMicroSlide(s, "user-main-tab-pointerdown", base + 1);
  s.activeTx.phase = "sliding";
  s.pin.phase = "sliding";
  markPopstateRestore(s, base + 50);
  push("7-popstate-during-active-tx", !s.activeTx && !s.pin);
}
{
  const s = createGuardState(true);
  push("8-direct-cold", !s.activeTx && !s.pin);
}
{
  const s = createGuardState(false);
  armClickIntent(s, "/chats", base);
  const ok = tryBeginMicroSlide(s, "user-main-tab-pointerdown", base + 1);
  push("9-flag-false", !ok && !s.pin && !s.activeTx);
}
{
  const s = createGuardState(true);
  hardNavOutsideMicro(s);
  updateInternalPathnameOnly(s);
  updateBottomNavActiveOnly(s);
  push(
    "10-non-micro-hard-nav",
    !s.pin && !s.activeTx && s.transitionBeginCount === 0,
  );
}

const passCount = cases.filter((c) => c.pass).length;
assert.equal(passCount, cases.length);
const report = {
  check: "LOCAL_HISTORY_BACK_FORWARD_PIN_GUARD_RELEASE_CHECK",
  PASS: passCount === cases.length,
  result: `${passCount}/${cases.length}`,
  cases,
  invariants: {
    NO_PIN_WITHOUT_ACTIVE_TX: true,
    POPSTATE_NEVER_CREATES_MICRO_SLIDE_TX: true,
    BACK_FORWARD_RESTORE_DOES_NOT_CONSUME_CLICK_INTENT: true,
    USER_CLICK_STILL_CREATES_VALID_TX: true,
    STALE_PIN_TX_NULL_CLEARED: true,
    DIRECT_COLD_UNCHANGED: true,
    FLAG_FALSE_UNCHANGED: true,
    NON_MICRO_HARD_NAV_UNCHANGED: true,
  },
};
fs.writeFileSync(path.join(outDir, "history-back-pin-guard-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(passCount === cases.length ? 0 : 1);
