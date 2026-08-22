/**
 * Multiple anonymous chat threads stay distinct in the inbox.
 * Usage: node --experimental-strip-types scripts/anon-inbox-multi-thread.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const inbox = await import(
  pathToFileURL(path.join(root, "src/lib/chat/inboxPeerTitle.ts")).href
);

const threadA = {
  id: "anon_sess1__anon_to__maria",
  canonicalChatId: "anon_sess1__anon_to__maria",
  targetUsername: "maria",
  lastMessage: "hola maria",
  anonSessionId: "anon_sess1",
  updatedAt: { toMillis: () => 10 },
};
const threadB = {
  id: "anon_sess1__anon_to__lucia",
  canonicalChatId: "anon_sess1__anon_to__lucia",
  targetUsername: "lucia",
  lastMessage: "hola lucia",
  anonSessionId: "anon_sess1",
  updatedAt: { toMillis: () => 20 },
};
const threadA2 = {
  id: "anon_sess2__anon_to__maria",
  canonicalChatId: "anon_sess2__anon_to__maria",
  targetUsername: "maria",
  lastMessage: "otra sesion",
  anonSessionId: "anon_sess2",
  updatedAt: { toMillis: () => 30 },
};

assert.notEqual(
  inbox.inboxPeerDedupeKey(threadA),
  inbox.inboxPeerDedupeKey(threadB),
);
assert.notEqual(
  inbox.inboxPeerDedupeKey(threadA),
  inbox.inboxPeerDedupeKey(threadA2),
);

const merged = inbox.dedupeInboxChats([threadA, threadB, threadA2]);
assert.equal(merged.length, 3);

const liveOnlyNew = [threadB];
const preserved = inbox.mergeVisibleInboxThreads(
  [threadA, threadB],
  liveOnlyNew,
  "",
  false,
);
assert.equal(preserved.length, 2);
assert.equal(
  preserved.some((row) => row.id === threadA.id),
  true,
);

const afterSync = inbox.mergeVisibleInboxThreads(
  [threadA, threadB],
  liveOnlyNew,
  "",
  true,
);
assert.equal(afterSync.length, 1);
assert.equal(afterSync[0].id, threadB.id);

assert.equal(
  inbox.areInboxQuerySnapshotsComplete(["participantes"], { uid: true, anon: false }),
  false,
);
assert.equal(
  inbox.areInboxQuerySnapshotsComplete(
    ["participantes", "anonOwner", "receptor", "target"],
    { uid: true, anon: false },
  ),
  true,
);
assert.equal(
  inbox.areInboxQuerySnapshotsComplete(
    ["participantes", "anonOwner", "receptor", "target"],
    { uid: true, anon: true },
  ),
  false,
);
assert.equal(
  inbox.areInboxQuerySnapshotsComplete(
    ["anonParticipantes", "anonSession"],
    { uid: false, anon: true },
  ),
  true,
);

const cohort = await import(
  pathToFileURL(path.join(root, "src/lib/chat/inboxQueryCohort.ts")).href
);

const families = { uid: true, anon: true };
const keyA = cohort.inboxQueryCohortKey({
  uid: "owner_1",
  anonId: "anon_A",
  uidFamily: true,
  anonFamily: true,
});
const keyB = cohort.inboxQueryCohortKey({
  uid: "owner_1",
  anonId: "anon_B",
  uidFamily: true,
  anonFamily: true,
});
assert.notEqual(keyA, keyB);

let state = cohort.createInboxQueryCohortState();
state = cohort.reduceInboxQueryCohort(state, { type: "rotate", key: keyA });
const genA = state.generation;
assert.equal(state.synced, false);

for (const queryKey of [
  ...inbox.UID_INBOX_QUERY_KEYS,
  ...inbox.ANON_INBOX_QUERY_KEYS,
]) {
  state = cohort.reduceInboxQueryCohort(state, {
    type: "snapshot",
    generation: genA,
    queryKey,
    families,
  });
}
assert.equal(state.synced, true);

const rotated = cohort.reduceInboxQueryCohort(state, { type: "rotate", key: keyB });
assert.equal(rotated.generation, genA + 1);
assert.equal(rotated.synced, false);
assert.equal(rotated.receivedKeys.length, 0);
assert.deepEqual(rotated.mapsToClear, [...inbox.ANON_INBOX_QUERY_KEYS]);
assert.equal(rotated.uidChanged, false);
state = rotated;
const genB = state.generation;

state = cohort.reduceInboxQueryCohort(state, {
  type: "snapshot",
  generation: genB,
  queryKey: "anonParticipantes",
  families,
});
assert.equal(state.synced, false);
assert.deepEqual(state.receivedKeys, ["anonParticipantes"]);

const staleA = cohort.reduceInboxQueryCohort(state, {
  type: "snapshot",
  generation: genA,
  queryKey: "anonSession",
  families,
});
assert.equal(staleA.ignored, true);
assert.equal(staleA.synced, false);
assert.deepEqual(staleA.receivedKeys, ["anonParticipantes"]);
state = staleA;

state = cohort.reduceInboxQueryCohort(state, {
  type: "snapshot",
  generation: genB,
  queryKey: "anonSession",
  families,
});
assert.equal(state.synced, false);

for (const queryKey of inbox.UID_INBOX_QUERY_KEYS) {
  state = cohort.reduceInboxQueryCohort(state, {
    type: "snapshot",
    generation: genB,
    queryKey,
    families,
  });
}
assert.equal(state.synced, true);

const liveBOnly = [threadA2];
const preservedAcrossCohort = inbox.mergeVisibleInboxThreads(
  [threadA, threadB],
  liveBOnly,
  "owner_1",
  false,
);
assert.equal(preservedAcrossCohort.length, 3);

console.log(JSON.stringify({ gate: "ANON_INBOX_MULTI_THREAD", pass: true }, null, 2));
