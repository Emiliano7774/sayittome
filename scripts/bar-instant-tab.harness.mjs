/**
 * BAR_INSTANT_TAB — the tapped bar section owns the screen before the URL moves.
 * Shuffle must not keep Chats painted as its underlay.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const tabs = await import(pathToFileURL(path.join(root, "src/lib/navigation/mainTabKeepAlive.ts")).href);

tabs.armIncomingBarTab("/stories");
assert.equal(tabs.getIncomingBarTab(), "/stories");
assert.equal(tabs.isMainTabPanelVisible("/shuffle", "/stories"), true);
assert.equal(tabs.isMainTabPanelVisible("/shuffle", "/chats"), false);
assert.equal(tabs.isMainTabPanelVisible("/u/ada", "/chats"), false);

tabs.syncIncomingBarTab("/stories");
assert.equal(tabs.getIncomingBarTab(), null);
assert.equal(tabs.isMainTabPanelVisible("/stories", "/stories"), true);
assert.equal(tabs.isMainTabPanelVisible("/stories", "/chats"), false);
assert.equal(tabs.isMainTabPanelVisible("/shuffle", "/chats"), false);

tabs.armIncomingBarTab("/shuffle");
assert.equal(tabs.isMainTabPanelVisible("/chats", "/chats"), false);
assert.equal(tabs.isMainTabPanelVisible("/stories", "/stories"), false);
tabs.syncIncomingBarTab("/shuffle");
assert.equal(tabs.getIncomingBarTab(), null);

console.log(JSON.stringify({ gate: "BAR_INSTANT_TAB", pass: true }));
