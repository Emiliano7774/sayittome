/**
 * SHUFFLE_ACTIVE_FILTER
 * Same-tab "activos" uses canonical recent-connection window and prunes stale slots.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const poolSrc = fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8");
assert.match(poolSrc, /pruneShuffleSlotsToPool/);
assert.match(poolSrc, /refreshPoolPresence/);
assert.match(poolSrc, /needsMembershipRefresh/);

const presence = await import(pathToFileURL(path.join(root, "src/lib/presence.ts")).href);
const refresh = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/refreshPresence.ts")).href
);
const filters = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/serverFilters.ts")).href
);
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSlotsStore.ts")).href
);

const now = Date.parse("2026-08-22T21:00:00.000Z");
const fresh = {
  uid: "fresh-1",
  username: "fresh",
  bio: "",
  photo: "https://cdn.example.com/fresh.jpg",
  blurPhoto: false,
  showOnline: true,
  mostrarUltimaVez: true,
  presenceAt: new Date(now - 60_000).toISOString(),
  lastActive: new Date(now - 60_000).toISOString(),
};
const stale = {
  uid: "stale-1",
  username: "stale",
  bio: "",
  photo: "https://cdn.example.com/stale.jpg",
  blurPhoto: false,
  showOnline: true,
  mostrarUltimaVez: true,
  presenceAt: new Date(now - presence.ONLINE_WINDOW_MS - 60_000).toISOString(),
  lastActive: new Date(now - presence.ONLINE_WINDOW_MS - 60_000).toISOString(),
};

assert.equal(presence.isShuffleProfileOnline(fresh, now), true);
assert.equal(presence.isShuffleProfileOnline(stale, now), false);

const refreshed = refresh.refreshPoolPresence([fresh, stale], now);
assert.equal(refreshed.find((row) => row.uid === "fresh-1")?.showOnline, true);
assert.equal(refreshed.find((row) => row.uid === "stale-1")?.showOnline, false);

const onlineFilter = {
  pais: "",
  sexo: "todos",
  provincia: "",
  ciudad: "",
  edadMin: 0,
  edadMax: 0,
  soloOnline: true,
  soloConFoto: false,
  soloConHistorias: false,
  intereses: [],
};
assert.equal(filters.profileMatchesShuffleServerFilters(fresh, onlineFilter, now), true);
assert.equal(filters.profileMatchesShuffleServerFilters(stale, onlineFilter, now), false);

slots.resetShuffleWindowSlots();
slots.setShuffleSlotsWithFeatured([], [fresh, stale], Int32Array.from([0, 1]), 2, true);
slots.flushShuffleSlotsSync();
assert.equal(slots.getVisibleShuffleProfiles().length, 2);

slots.pruneShuffleSlotsToPool([fresh]);
slots.flushShuffleSlotsSync();
const kept = slots.getVisibleShuffleProfiles();
assert.equal(kept.length, 1);
assert.equal(kept[0].uid, "fresh-1");

slots.resetShuffleWindowSlots();

console.log(JSON.stringify({ gate: "SHUFFLE_ACTIVE_FILTER", pass: true }, null, 2));
