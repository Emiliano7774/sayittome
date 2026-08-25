/**
 * ANDROID_CHAT_BACK_IME
 * Product sequence: IME first, then exact prior screen, then consecutive history.
 * Dual hardware events must coalesce. No Shuffle forceWindow on chat leave.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const chatBackSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/chatBackNavigation.ts"),
  "utf8",
);
const handleSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/handleNativeBack.ts"),
  "utf8",
);
const bootSrc = fs.readFileSync(
  path.join(root, "src/components/app/NativeAppBootstrap.tsx"),
  "utf8",
);
const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);

assert.match(chatBackSrc, /resolveChatBackDecision/);
assert.match(chatBackSrc, /isVisualViewportKeyboardOpen/);
assert.match(chatBackSrc, /armChatImeDismissLatch/);
assert.match(chatBackSrc, /isChatImeDismissLatched/);
assert.match(handleSrc, /shouldCoalesceNativeHardwareBack/);
assert.match(handleSrc, /dismissChatKeyboard/);
assert.match(bootSrc, /shouldCoalesceNativeHardwareBack/);
assert.match(bootSrc, /App.addListener\("backButton"/);
assert.match(chatSrc, /resolveChatBackAction/);
assert.match(chatSrc, /noteChatComposerFocused/);
assert.match(chatSrc, /isChatImeDismissLatched/);
assert.doesNotMatch(chatSrc, /forceWindow:\s*true/);

const inboxLinkSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ChatInboxLink.tsx"),
  "utf8",
);
assert.match(inboxLinkSrc, /captureChatsListScroll/);
assert.match(inboxLinkSrc, /data-chat-id/);

const chatBack = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/chatBackNavigation.ts")).href
);
const handle = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/handleNativeBack.ts")).href
);
const stack = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/nativeNavStack.ts")).href
);

const first = chatBack.resolveChatBackDecision({
  pathname: "/chat/thread-1",
  phase: "idle",
  keyboardUp: true,
});
assert.equal(first.action.kind, "dismiss-keyboard");
assert.equal(first.nextPhase, "keyboard-dismissed");

const second = chatBack.resolveChatBackDecision({
  pathname: "/chat/thread-1",
  phase: first.nextPhase,
  keyboardUp: true,
});
assert.equal(second.action.kind, "leave-chat");
assert.equal(second.nextPhase, "idle");

const reopen = chatBack.resolveChatBackDecision({
  pathname: "/chat/thread-1",
  phase: "keyboard-dismissed",
  keyboardUp: true,
  composerFocused: true,
});
assert.equal(reopen.action.kind, "dismiss-keyboard");

const noIme = chatBack.resolveChatBackDecision({
  pathname: "/chat/thread-1",
  phase: "idle",
  keyboardUp: false,
});
assert.equal(noIme.action.kind, "leave-chat");

if (!document.body.style) document.body.style = {};
if (!document.documentElement.style) {
  document.documentElement.style = { removeProperty() {} };
}

handle.resetNativeBackNavigationState();
handle.resetNativeHardwareBackCoalesce();
stack.resetNativeNavStackForTests();
chatBack.resetChatBackNavigationState();

stack.recordNativeNavPath("/shuffle");
stack.recordNativeNavPath("/u/ana");
window.location.pathname = "/chat/thread-1";
window.innerHeight = 800;
window.visualViewport = { height: 400 };

handle.setBackLockMsOverride(0);
const dismiss = handle.resolveNativeBackNavigation("/chat/thread-1");
assert.deepEqual(dismiss, {});
assert.equal(chatBack.peekChatBackPhase(), "keyboard-dismissed");
assert.equal(stack.peekNativeNavPath("/chat/thread-1"), "/u/ana");

const t0 = Date.now();
handle.noteNativeHardwareBack(t0);
assert.equal(handle.shouldCoalesceNativeHardwareBack(t0 + 10), true);
assert.equal(handle.shouldCoalesceNativeHardwareBack(t0 + 200), false);

const leave = handle.resolveNativeBackNavigation("/chat/thread-1");
assert.equal(leave.navigateTo, "/u/ana");
assert.equal(stack.peekNativeNavPath("/u/ana"), "/shuffle");

handle.resetNativeBackNavigationState();
window.location.pathname = "/u/ana";
const consecutive = handle.resolveNativeBackNavigation("/u/ana");
assert.equal(consecutive.navigateTo, "/shuffle");

handle.setBackLockMsOverride(null);
handle.resetNativeBackNavigationState();
chatBack.resetChatBackNavigationState();
stack.resetNativeNavStackForTests();

console.log(JSON.stringify({ gate: "ANDROID_CHAT_BACK_IME", pass: true }, null, 2));
