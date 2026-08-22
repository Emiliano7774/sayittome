/**
 * Warm chat reopen first-frame + inbox cohort settle.
 * Usage: node --experimental-strip-types scripts/chat-thread-warm-first-frame.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const src = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);

assert.match(
  src,
  /const \[messages, setMessages\] = useState<Message\[\]>\(\(\) =>/,
  "messages must initialize from a lazy useState factory",
);
assert.match(
  src,
  /useState<Message\[\]>\(\(\) =>[\s\S]*?readCachedChatMessages\(chatId\)/,
  "lazy factory must read chat message cache for first paint",
);
assert.match(
  src,
  /useState<Message\[\]>\(\(\) =>[\s\S]*?hydrateCachedMessages/,
  "lazy factory must hydrate cached rows into UI messages",
);

assert.doesNotMatch(
  src,
  /const \[messages, setMessages\] = useState<Message\[\]>\(\[\]\);/,
  "must not start the thread from an empty array when cache can paint",
);

const cohort = await import(
  pathToFileURL(path.join(root, "src/lib/chat/inboxQueryCohort.ts")).href
);

function applyInboxUidRotate(state, key, warmSnapshot) {
  const next = cohort.reduceInboxQueryCohort(state, { type: "rotate", key });
  return {
    next,
    snapshot: next.uidChanged ? [] : warmSnapshot.slice(),
  };
}

const warmSnapshot = [{ id: "chat_warm", lastMessage: "hola" }];
const keyP = cohort.inboxQueryCohortKey({
  uid: "P",
  uidFamily: true,
  anonFamily: false,
});
const keyQ = cohort.inboxQueryCohortKey({
  uid: "Q",
  uidFamily: true,
  anonFamily: false,
});

let state = cohort.createInboxQueryCohortState();
const toP = applyInboxUidRotate(state, keyP, warmSnapshot);
assert.equal(toP.next.uidChanged, false);
assert.equal(toP.next.cohortKey, keyP);
assert.deepEqual(toP.snapshot, warmSnapshot);
state = toP.next;
const generationP = state.generation;

const toQ = applyInboxUidRotate(state, keyQ, toP.snapshot);
assert.equal(toQ.next.uidChanged, true);
assert.equal(toQ.next.cohortKey, keyQ);
assert.deepEqual(toQ.snapshot, []);
state = toQ.next;

const stale = cohort.reduceInboxQueryCohort(state, {
  type: "snapshot",
  generation: generationP,
  queryKey: "participantes",
  families: { uid: true },
});
assert.equal(stale.ignored, true);
assert.equal(stale.generation, toQ.next.generation);
assert.deepEqual(stale.receivedKeys, []);

const live = cohort.reduceInboxQueryCohort(state, {
  type: "snapshot",
  generation: state.generation,
  queryKey: "participantes",
  families: { uid: true },
});
assert.equal(live.ignored, false);
assert.deepEqual(live.receivedKeys, ["participantes"]);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_THREAD_WARM_FIRST_FRAME",
      pass: true,
    },
    null,
    2,
  ),
);
