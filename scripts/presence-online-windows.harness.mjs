/**
 * PRESENCE_ONLINE_WINDOWS
 * 0–3m label "en línea"; 3–15m minutes + still online for filter/dot; >15m offline.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const presenceSrc = fs.readFileSync(path.join(root, "src/lib/presence.ts"), "utf8");
assert.match(presenceSrc, /ONLINE_LABEL_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/);
assert.match(presenceSrc, /ONLINE_WINDOW_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);

const mod = await import(pathToFileURL(path.join(root, "src/lib/presence.ts")).href);
const now = Date.now();

assert.equal(mod.ONLINE_LABEL_MS, 3 * 60 * 1000);
assert.equal(mod.ONLINE_WINDOW_MS, 15 * 60 * 1000);

const t1m = new Date(now - 60_000).toISOString();
const t5m = new Date(now - 5 * 60_000).toISOString();
const t20m = new Date(now - 20 * 60_000).toISOString();

assert.equal(mod.formatLastSeen(t1m), "en linea");
assert.match(mod.formatLastSeen(t5m), /hace 5 min/);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t1m }, now), true);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t5m }, now), true);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t20m }, now), false);
assert.equal(mod.isLiveByConnection(t5m, mod.ONLINE_WINDOW_MS, now), true);
assert.equal(mod.isLiveByConnection(t20m, mod.ONLINE_WINDOW_MS, now), false);

console.log(JSON.stringify({ gate: "PRESENCE_ONLINE_WINDOWS", pass: true }, null, 2));
