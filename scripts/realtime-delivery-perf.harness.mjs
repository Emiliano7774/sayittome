/**
 * REALTIME_DELIVERY_PERF
 * Mocked onSnapshot burst → merge/equality → setState scheduling cost.
 * No Firestore, no PII, no message content in assertions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

// Minimal rAF so paint scheduling resolves in Node.
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => {
  rafQueue.push(cb);
  return rafQueue.length;
};
function flushRaf(rounds = 2) {
  for (let r = 0; r < rounds; r += 1) {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const cb of batch) cb(performance.now());
  }
}

const pages = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatHistoryPages.ts")).href
);
const equalMod = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessagesVisualEqual.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);
const rt = await import(
  pathToFileURL(path.join(root, "src/lib/perf/realtimeDeliveryTrace.ts")).href
);

rt.setRealtimePerfEnabledForTests(true);
rt.clearRealtimePerfSamples();

function makeRows(n, seed = 0) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      id: `m${seed + i}`,
      text: `body-${seed + i}`,
      mine: i % 3 === 0,
      status: "sent",
      mediaUrl: i % 7 === 0 ? `https://example.invalid/${seed + i}` : "",
      deletedForEveryone: false,
    });
  }
  return rows;
}

// --- Equality: no stale drop, no false equal on new tail ---
{
  const a = makeRows(40);
  const b = makeRows(40);
  assert.equal(equalMod.chatMessagesVisuallyEqual(a, b), true);
  const c = makeRows(40);
  c[39] = { ...c[39], text: "changed" };
  assert.equal(equalMod.chatMessagesVisuallyEqual(a, c), false);
  const d = [...makeRows(40), { id: "m40", text: "new", mine: false, status: "sent" }];
  assert.equal(equalMod.chatMessagesVisuallyEqual(a, d), false);
}

// --- Burst merge preserves order / no dup ids ---
{
  let state = makeRows(30, 0);
  const seenOrders = [];
  for (let burst = 0; burst < 25; burst += 1) {
    const handle = rt.realtimePerfListenerBegin("mock", {
      docCount: 30 + burst,
      burstIndex: burst,
    });
    const live = makeRows(30, burst); // sliding window ids shift
    const pending = state.filter((row) => row.status === "sending");
    const merged = pages.mergeLiveWindowIntoHistory(
      state,
      live,
      pending,
      (loaded, pend) => [...loaded, ...pend],
    );
    const ids = merged.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicated message ids");
    // Last live id must be the last durable (non-pending) id
    const lastLive = live[live.length - 1].id;
    assert.ok(ids.includes(lastLive), "fresh live id present");
    if (!equalMod.chatMessagesVisuallyEqual(state, merged)) {
      state = merged;
      cache.writeCachedChatMessages("mock-thread", state.map((row) => ({
        id: row.id,
        text: row.text,
        mine: row.mine,
        mediaUrl: row.mediaUrl || undefined,
      })));
    }
    rt.realtimePerfAfterSetState(handle);
    rt.realtimePerfSchedulePaint(handle);
    seenOrders.push(ids[ids.length - 1]);
  }
  flushRaf(4);
  // Last message id must monotonically reflect newest burst seed+29
  assert.equal(seenOrders[seenOrders.length - 1], "m53"); // seed 24 + 29
}

// --- Memory cache is sync; session persist is deferred ---
{
  const mem = cache.readCachedChatMessages("mock-thread");
  assert.ok(mem && mem.length > 0, "memory cache warm after bursts");
}

// --- Signature-style cost: pairwise equal beats giant join on same data ---
{
  const rows = makeRows(50);
  const joinSig = (messages) =>
    messages
      .map(
        (m) =>
          `${m.id}:${m.mine ? 1 : 0}:${m.status || ""}:${m.text}:${m.mediaUrl || ""}:${m.deletedForEveryone ? 1 : 0}:`,
      )
      .join("|");
  const rounds = 200;
  const tJoin0 = performance.now();
  for (let i = 0; i < rounds; i += 1) {
    void (joinSig(rows) === joinSig(rows));
  }
  const joinMs = performance.now() - tJoin0;
  const tEq0 = performance.now();
  for (let i = 0; i < rounds; i += 1) {
    void equalMod.chatMessagesVisuallyEqual(rows, rows);
  }
  const eqMs = performance.now() - tEq0;
  assert.ok(
    eqMs <= joinMs * 1.15 + 2,
    `pairwise equal should not be slower than join signature (eq=${eqMs.toFixed(2)} join=${joinMs.toFixed(2)})`,
  );
}

const samples = rt.getRealtimePerfSamples();
assert.ok(samples.length >= 25, "perf samples recorded for bursts");
const withSetState = samples.filter((s) => s.setStateMs != null);
assert.ok(withSetState.length >= 25);
const summary = rt.summarizeRealtimePerf();

// Source gates: wiring present, no artificial >1-frame batching on listener path
const legacySrc = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);
const profileSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const anonSrc = fs.readFileSync(
  path.join(root, "src/components/anonMatch/AnonDirectChatWindow.tsx"),
  "utf8",
);
const cacheSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/chatMessageCache.ts"),
  "utf8",
);
const shellSrc = fs.readFileSync(
  path.join(root, "src/contexts/MainTabShellContext.tsx"),
  "utf8",
);

assert.match(legacySrc, /realtimePerfListenerBegin\("legacy"/);
assert.match(legacySrc, /void markChatAsRead\(/);
assert.doesNotMatch(legacySrc, /onSnapshot\(q, async \(snapshot\)/);
assert.match(profileSrc, /chatMessagesVisuallyEqual/);
assert.match(profileSrc, /realtimePerfListenerBegin\("profile-anon"/);
assert.match(anonSrc, /realtimePerfListenerBegin\("anon-direct"/);
assert.match(cacheSrc, /scheduleSessionPersist/);
assert.match(shellSrc, /hasPendingChatSends\(\)/);
assert.doesNotMatch(profileSrc, /chatMessagesSignature/);

console.log(
  JSON.stringify(
    {
      gate: "REALTIME_DELIVERY_PERF",
      pass: true,
      samples: samples.length,
      summary,
      notes: [
        "Mocked bursts only — not peer network RTT",
        "Local write ack instrumented on legacy send when flag on",
        "No message content/IDs logged by tracer",
      ],
    },
    null,
    2,
  ),
);
