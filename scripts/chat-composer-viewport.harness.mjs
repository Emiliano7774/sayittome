/**
 * CHAT_COMPOSER_VIEWPORT
 * Shell is already visualViewport.height — chrome outside that box must not
 * be added again as padding. Geometry: composerBottom <= visibleBottom.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const composer = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatComposerViewport.ts")).href
);

const webChrome = composer.computeChatComposerViewport({
  innerHeight: 844,
  visualViewport: { height: 700, offsetTop: 0 },
  safeAreaBottom: 34,
  isNativeShell: false,
});
assert.equal(webChrome.shellHeight, 700);
assert.equal(webChrome.chromeBottomPx, 144);
assert.equal(webChrome.keyboardOpen, false);
assert.ok(webChrome.composerPadPx <= composer.WEB_COMPOSER_PAD_CAP);
assert.ok(webChrome.composerPadPx < 80, "reduced vv must not produce 178 double-clip pad");
assert.notEqual(webChrome.composerPadPx, 178);
assert.equal(webChrome.composerPadPx, 34);
assert.equal(webChrome.overlayInsetPx, 34);
assert.equal(webChrome.doubleNativeSafeArea, false);
assert.equal(composer.isComposerWithinVisibleViewport(webChrome), true);
assert.equal(composer.isComposerControlsTouchable(webChrome), true);
assert.ok(webChrome.controlRowBottom <= webChrome.visibleBottom - webChrome.overlayInsetPx);

const unclipped = composer.computeChatComposerViewport({
  innerHeight: 844,
  visualViewport: { height: 844, offsetTop: 0 },
  safeAreaBottom: 0,
  isNativeShell: false,
});
assert.equal(unclipped.chromeBottomPx, 0);
assert.ok(
  unclipped.composerPadPx >= composer.WEB_OVERLAY_FLOOR_PX,
  "published pad=12 leaves controls under the phone edge when vv does not shrink",
);
assert.equal(composer.isComposerControlsTouchable(unclipped), true);
assert.ok(unclipped.controlRowBottom <= unclipped.visibleBottom - unclipped.overlayInsetPx);

const keyboard = composer.computeChatComposerViewport({
  innerHeight: 844,
  visualViewport: { height: 420, offsetTop: 0 },
  safeAreaBottom: 34,
  isNativeShell: false,
});
assert.equal(keyboard.keyboardOpen, true);
assert.equal(keyboard.shellHeight, 420);
assert.equal(keyboard.composerPadPx, 12);
assert.equal(composer.isComposerWithinVisibleViewport(keyboard), true);

const native = composer.computeChatComposerViewport({
  innerHeight: 844,
  visualViewport: { height: 800, offsetTop: 0 },
  safeAreaBottom: 34,
  isNativeShell: true,
});
assert.equal(native.composerPadPx, 12);
assert.equal(native.doubleNativeSafeArea, false);

const vars = {};
composer.applyChatComposerViewportVars(
  {
    documentElement: {
      style: {
        setProperty(name, value) {
          vars[name] = value;
        },
      },
    },
  },
  webChrome,
);
assert.equal(vars["--sayittome-chat-vvh"], "700px");
assert.equal(vars["--sayittome-chat-composer-pad"], `${webChrome.composerPadPx}px`);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_COMPOSER_VIEWPORT",
      pass: true,
      webPad: webChrome.composerPadPx,
      keyboardPad: keyboard.composerPadPx,
      nativePad: native.composerPadPx,
    },
    null,
    2,
  ),
);
