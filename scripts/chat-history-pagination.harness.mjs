/**
 * CHAT_HISTORY_PAGINATION
 * Live window upserts must not drop older pages; scroll anchor is height-stable.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const pages = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatHistoryPages.ts")).href
);

function mergePending(loaded, pending) {
  return [...loaded, ...pending];
}

const older = [
  { id: "1", text: "a" },
  { id: "2", text: "b" },
];
const live = [
  { id: "2", text: "b2" },
  { id: "3", text: "c" },
];
const pending = [{ id: "tmp", clientId: "tmp", status: "sending", text: "x" }];

const prev = [...older, { id: "3", text: "c-old" }];
const merged = pages.mergeLiveWindowIntoHistory(prev, live, pending, mergePending);
assert.deepEqual(
  merged.map((row) => row.id),
  ["1", "2", "3", "tmp"],
);
assert.equal(merged.find((row) => row.id === "2")?.text, "b2");

const prepended = pages.prependOlderMessages(
  [{ id: "3" }, { id: "4" }],
  [{ id: "1" }, { id: "3" }, { id: "2" }],
);
assert.deepEqual(
  prepended.map((row) => row.id),
  ["1", "2", "3", "4"],
);

const node = { scrollHeight: 1000, scrollTop: 400 };
const anchor = pages.captureScrollAnchor(node);
node.scrollHeight = 1400;
pages.restoreScrollAnchor(node, anchor);
assert.equal(node.scrollTop, 800);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /mergeLiveWindowIntoHistory/);
assert.match(chatSrc, /loadOlderMessages/);
assert.match(chatSrc, /CHAT_MESSAGE_PAGE_SIZE/);
assert.match(chatSrc, /restoreScrollAnchor/);

console.log(JSON.stringify({ gate: "CHAT_HISTORY_PAGINATION", pass: true }, null, 2));
