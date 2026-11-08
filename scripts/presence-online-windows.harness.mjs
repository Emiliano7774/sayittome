/**
 * PRESENCE_ONLINE_WINDOWS
 * 0–3h label "en línea" plus active filter/dot; >3h last-seen and offline.
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
assert.match(presenceSrc, /ONLINE_LABEL_MS\s*=\s*ONLINE_WINDOW_MS/);
assert.match(presenceSrc, /ONLINE_WINDOW_MS\s*=\s*3\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);

const mod = await import(pathToFileURL(path.join(root, "src/lib/presence.ts")).href);
const now = Date.now();

assert.equal(mod.ONLINE_LABEL_MS, 3 * 60 * 60 * 1000);
assert.equal(mod.ONLINE_WINDOW_MS, 3 * 60 * 60 * 1000);

const t1m = new Date(now - 60_000).toISOString();
const t5m = new Date(now - 5 * 60_000).toISOString();
const t20m = new Date(now - 20 * 60_000).toISOString();
const t179m = new Date(now - 179 * 60_000).toISOString();
const t181m = new Date(now - 181 * 60_000).toISOString();

assert.equal(mod.formatLastSeen(t1m), "en linea");
assert.equal(mod.formatLastSeen(t5m), "en linea");
assert.equal(mod.formatLastSeen(t20m), "en linea");
assert.equal(mod.formatLastSeen(t179m), "en linea");
assert.match(mod.formatLastSeen(t181m), /Ultima conexion hace 3 horas/);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t1m }, now), true);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t5m }, now), true);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t20m }, now), true);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t179m }, now), true);
assert.equal(mod.isShuffleProfileOnline({ presenceAt: t181m }, now), false);
assert.equal(mod.isLiveByConnection(t5m, mod.ONLINE_WINDOW_MS, now), true);
assert.equal(mod.isLiveByConnection(t20m, mod.ONLINE_WINDOW_MS, now), true);
assert.equal(mod.isLiveByConnection(t179m, mod.ONLINE_WINDOW_MS, now), true);
assert.equal(mod.isLiveByConnection(t181m, mod.ONLINE_WINDOW_MS, now), false);

console.log(JSON.stringify({ gate: "PRESENCE_ONLINE_WINDOWS", pass: true }, null, 2));
