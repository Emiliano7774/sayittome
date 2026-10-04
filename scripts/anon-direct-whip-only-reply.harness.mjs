/**
 * Temp-chat whip only on a new inbound reply, never on remount or match noise.
 *   node --experimental-strip-types scripts/anon-direct-whip-only-reply.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const whip = await import(
  pathToFileURL(path.join(root, "src/lib/anonMatch/anonDirectIncomingWhip.ts")).href
);

const baseline = whip.shouldWhipAnonDirectIncoming({
  senderId: "anon_me",
  fromId: "anon_peer",
  messageId: "m1",
  lastWhipMessageId: null,
  bootstrapped: false,
});
assert.equal(baseline.whip, false);

const remount = whip.shouldWhipAnonDirectIncoming({
  senderId: "anon_me",
  fromId: "anon_peer",
  messageId: "m1",
  lastWhipMessageId: "m1",
  bootstrapped: true,
});
assert.equal(remount.whip, false);

const ownSend = whip.shouldWhipAnonDirectIncoming({
  senderId: "anon_me",
  fromId: "anon_me",
  messageId: "m2",
  lastWhipMessageId: "m1",
  bootstrapped: true,
});
assert.equal(ownSend.whip, false);

const reply = whip.shouldWhipAnonDirectIncoming({
  senderId: "anon_me",
  fromId: "anon_peer",
  messageId: "m3",
  lastWhipMessageId: "m2",
  bootstrapped: true,
});
assert.equal(reply.whip, true);

const emptySender = whip.shouldWhipAnonDirectIncoming({
  senderId: "",
  fromId: "anon_peer",
  messageId: "m4",
  lastWhipMessageId: "m3",
  bootstrapped: true,
});
assert.equal(emptySender.whip, false);

assert.equal(
  whip.shouldAlertIncomingAnonMatchRequest({
    requestId: "req1",
    alreadyAlerted: false,
    chatOpen: true,
  }),
  false,
);
assert.equal(
  whip.shouldAlertIncomingAnonMatchRequest({
    requestId: "req1",
    alreadyAlerted: true,
    chatOpen: false,
  }),
  false,
);
assert.equal(
  whip.shouldAlertIncomingAnonMatchRequest({
    requestId: "req1",
    alreadyAlerted: false,
    chatOpen: false,
  }),
  true,
);

const windowSrc = readFileSync(
  path.join(root, "src/components/anonMatch/AnonDirectChatWindow.tsx"),
  "utf8",
);
assert.match(windowSrc, /if \(!chatId \|\| !senderId\) return/);
assert.match(windowSrc, /shouldWhipAnonDirectIncoming/);

const contextSrc = readFileSync(
  path.join(root, "src/contexts/AnonMatchContext.tsx"),
  "utf8",
);
assert.match(contextSrc, /shouldAlertIncomingAnonMatchRequest/);
assert.match(contextSrc, /openChatRef\.current\?\.chatId/);

console.log("anon-direct-whip-only-reply: ok");
