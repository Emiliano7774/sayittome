/**
 * COMPOSER_FOCUS_POLICY — regression harness for IME thrash fix.
 * Asserts: no delayed focus cascade; vv resize never re-focuses; already-focused skips.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const policy = await import(
  pathToFileURL(path.join(root, "src/lib/chat/composerFocusPolicy.ts")).href
);

assert.deepEqual(policy.composerRefocusDelayMs(), [], "no delayed focus cascade");

const latch = policy.decideComposerRefocus({
  imeDismissLatched: true,
  alreadyFocused: false,
});
assert.equal(latch.focusNow, false);
assert.equal(latch.reason, "ime-dismiss-latched");

const focused = policy.decideComposerRefocus({
  imeDismissLatched: false,
  alreadyFocused: true,
});
assert.equal(focused.focusNow, false);
assert.equal(focused.reason, "already-focused");

const once = policy.decideComposerRefocus({
  imeDismissLatched: false,
  alreadyFocused: false,
});
assert.equal(once.focusNow, true);
assert.equal(once.reason, "focus-once");

const vv = policy.decideComposerRefocusOnViewportResize();
assert.equal(vv.focusNow, false);
assert.equal(vv.reason, "skip-viewport-resize-refocus");

// Simulate 10 taps: each tap starts unfocused then focuses once — never cascades.
let focusCalls = 0;
for (let i = 0; i < 10; i += 1) {
  let already = false;
  const d1 = policy.decideComposerRefocus({
    imeDismissLatched: false,
    alreadyFocused: already,
  });
  if (d1.focusNow) {
    focusCalls += 1;
    already = true;
  }
  // Send / scroll / vv resize must not add more focus while focused.
  const d2 = policy.decideComposerRefocus({
    imeDismissLatched: false,
    alreadyFocused: already,
  });
  assert.equal(d2.focusNow, false);
  assert.equal(policy.decideComposerRefocusOnViewportResize().focusNow, false);
  assert.equal(policy.composerRefocusDelayMs().length, 0);
}
assert.equal(focusCalls, 10, "exactly one focus per composer open");

console.log("composer-focus-policy.harness: PASS");
