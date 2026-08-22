/**
 * Notification store + self-push + titles. Imports production modules + functions/lib.
 *
 * Usage: node --experimental-strip-types scripts/fcm-registration.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return "";
  const abs = path.join(root, "src", specifier.slice(2));
  const candidates = [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`, path.join(abs, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return "";
}

if (typeof module.registerHooks === "function") {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const mapped = resolveAlias(specifier);
      if (mapped) return { url: mapped, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}
const store = await import(
  pathToFileURL(path.join(root, "src/lib/chat/fcmRegistrationStore.ts")).href
);
const copy = await import(
  pathToFileURL(path.join(root, "src/lib/chat/pushNotificationCopy.ts")).href
);
const install = await import(
  pathToFileURL(path.join(root, "src/lib/chat/fcmInstallation.ts")).href
);
const ready = await import(
  pathToFileURL(path.join(root, "src/lib/chat/notificationProfileReady.ts")).href
);

assert.equal(store.classifyOsPermission("granted"), "granted");
assert.equal(store.classifyOsPermission("denied"), "denied");
assert.equal(store.classifyOsPermission("prompt"), "not_asked");
assert.equal(store.classifyOsPermission(""), "unknown");

const recipients = store.excludeSelfPushUids(
  ["owner_1", "visitor_auth", "profile_owner_1"],
  {
    fromUid: "anon_bbbb",
    senderAuthUid: "visitor_auth",
    createdByAuthUid: "visitor_auth",
  },
);
assert.deepEqual(recipients.sort(), ["owner_1", "profile_owner_1"]);

assert.equal(
  store.resolvePushTitle({ senderRole: "anon", fromUid: "anon_bbbbcccc" }),
  "Anon-bbbbcccc",
);
assert.equal(
  store.resolvePushTitle({
    senderRole: "profile",
    fromUid: "profile_owner_1",
    targetUsername: "maria",
  }),
  "maria",
);
assert.equal(
  store.resolvePushTitle({ fromUid: "legacy_uid", targetUsername: "pepe" }),
  "pepe",
);
assert.equal(
  copy.resolvePushTitle({
    senderRole: "anon",
    fromUid: "AbCdEfGhIjKlMnOpQrStUv",
    from: "AbCdEfGhIjKlMnOpQrStUv",
  }),
  "Anon",
);
assert.doesNotMatch(
  copy.resolvePushTitle({ senderRole: "anon", fromUid: "AbCdEfGhIjKlMnOpQrStUv" }),
  /AbCdEf/,
);
assert.equal(install.shouldFlushPendingUnregister({
  pendingUid: "uid_a",
  currentUid: "uid_b",
  pendingToken: "tok",
}), false);
assert.equal(install.shouldFlushPendingUnregister({
  pendingUid: "uid_a",
  currentUid: "uid_a",
  pendingToken: "tok",
}), true);
assert.equal(install.shouldFlushPendingUnregister({
  pendingUid: "uid_a",
  currentUid: "uid_a",
  pendingToken: "tok",
  currentToken: "tok",
}), false, "must not flush the token just registered");
assert.equal(
  install.shouldFlushPendingUnregister({
    pendingUid: "uid_a",
    currentUid: "uid_a",
    pendingToken: "old",
    currentToken: "old",
    nextToken: "new",
  }),
  true,
  "rotated token must flush old even if memory still holds old",
);
assert.equal(
  install.shouldFlushPendingUnregister({
    pendingUid: "uid_a",
    currentUid: "uid_a",
    pendingToken: "new",
    currentToken: "old",
    nextToken: "new",
  }),
  false,
  "must not flush the token about to register",
);
assert.equal(
  install.shouldFlushPendingUnregister({
    pendingUid: "uid_a",
    currentUid: "uid_a",
    liveUid: "uid_a",
    pendingToken: "old",
  }),
  true,
  "offline pending retry with prefs-off still flushes when uid matches",
);
assert.equal(
  install.shouldFlushPendingUnregister({
    pendingUid: "uid_a",
    currentUid: "uid_b",
    liveUid: "uid_b",
    pendingToken: "tok_a",
  }),
  false,
  "pending A must never flush while live as B",
);
assert.equal(
  install.reconcilePendingBeforeRegister({
    pendingUid: "uid_a",
    pendingToken: "tok",
    currentUid: "uid_a",
    nextToken: "tok",
    pendingInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
    currentInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
  }),
  "clear_local",
);
assert.equal(
  install.reconcilePendingBeforeRegister({
    pendingUid: "uid_a",
    pendingToken: "old",
    currentUid: "uid_a",
    nextToken: "new",
    pendingInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
    currentInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
  }),
  "flush_then_register",
);
assert.equal(
  install.reconcilePendingBeforeRegister({
    pendingUid: "uid_a",
    pendingToken: "tok",
    currentUid: "uid_b",
    nextToken: "tok",
    pendingInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
    currentInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
  }),
  "register_claims",
);
assert.equal(
  install.reconcilePendingBeforeRegister({
    pendingUid: "uid_a",
    pendingToken: "tok",
    currentUid: "uid_a",
    nextToken: "tok",
    pendingInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
    currentInstallationId: "inst_aaaaaaaa-e89b-42d3-a456-426614174000",
  }),
  "none",
);
assert.equal(
  install.shouldClearPendingUnregister({
    pendingInstallationId: "inst_123e4567-e89b-42d3-a456-426614174000",
    currentInstallationId: "inst_aaaaaaaa-e89b-42d3-a456-426614174000",
  }),
  false,
);
{
  const secret = install.generateInstallationSecret();
  assert.equal(install.isValidInstallationSecret(secret), true);
  assert.ok(secret.length >= 32);
  const proof = await install.makeInstallationProof(
    "inst_123e4567-e89b-42d3-a456-426614174000",
    secret,
  );
  assert.equal(install.isValidInstallationProof(proof), true);
  assert.equal(proof.length, 64);
  assert.equal(install.isValidInstallationProof("p_deadbeef"), false);
  await assert.rejects(
    () => install.makeInstallationProof("inst_123e4567-e89b-42d3-a456-426614174000", "short"),
    /invalid_installation_material/,
  );
}
assert.equal(install.isValidFcmInstallationId("inst_not-a-uuid"), false);
assert.equal(
  install.isValidFcmInstallationId("inst_123e4567-e89b-42d3-a456-426614174000"),
  true,
);
assert.equal(
  ready.isNotificationProfileReady({
    loading: false,
    isAnonymous: false,
    uid: "u1",
    username: "maria",
    profileSetupComplete: true,
    email: "a@b.com",
    emailVerified: false,
  }),
  false,
);
assert.equal(
  ready.isNotificationProfileReady({
    loading: false,
    isAnonymous: false,
    uid: "u1",
    username: "maria",
    profileSetupComplete: true,
    email: "a@b.com",
    emailVerified: true,
  }),
  true,
);
assert.equal(store.setFcmRegistrationState("", { status: "active" }).uid, "");
const emptyUnsub = store.subscribeFcmRegistration("", () => undefined);
emptyUnsub();

const functionsLib = path.join(root, "functions/lib/pushNotificationCopy.js");
assert.equal(fs.existsSync(functionsLib), true, "functions/lib push copy must exist");
const libCopy = await import(pathToFileURL(functionsLib).href);
assert.equal(
  libCopy.resolvePushTitle({
    senderRole: "anon",
    fromUid: "AbCdEfGhIjKlMnOpQrStUv",
    from: "AbCdEfGhIjKlMnOpQrStUv",
  }),
  "Anon",
);

const seen = [];
const unsub = store.subscribeFcmRegistration("uid_a", (state) => seen.push(state.status));
store.setFcmRegistrationState("uid_a", { status: "registering" });
store.setFcmRegistrationState("uid_a", { status: "active", tokenHash: "abc" });
unsub();
assert.ok(seen.includes("unknown"));
assert.ok(seen.includes("registering"));
assert.ok(seen.includes("active"));
assert.equal(store.getFcmRegistrationState("uid_a").status, "active");
assert.equal(store.getFcmRegistrationState("uid_b").status, "unknown");

const compiledIndex = path.join(root, "functions/lib/index.js");
assert.equal(fs.existsSync(compiledIndex), true, "functions/lib/index.js must be compiled");
const compiled = await import(pathToFileURL(compiledIndex).href);
assert.equal(typeof compiled.registerFcmTokenInTransaction, "function");
assert.equal(typeof compiled.unregisterFcmTokenInTransaction, "function");
assert.equal(typeof compiled.decideInstallationProofUpdate, "function");
assert.equal(typeof compiled.assertDurableRateLimit, "function");

const pipeline = await import(
  pathToFileURL(path.join(root, "src/lib/chat/fcmEnablePipeline.ts")).href
);
const INST = "inst_123e4567-e89b-42d3-a456-426614174000";
const HMAC = "a".repeat(64);
const OLD = "old_token_xxxxxxxxxxxxxxxxxxxx";
const NEXT = "new_token_yyyyyyyyyyyyyyyyyyyy";

function memoryTx(store) {
  const guard = compiled.createReadBeforeWriteGuard?.() || {
    assertCanRead() {},
    markWrite() {},
  };
  return {
    async get(ref) {
      guard.assertCanRead?.();
      return store.get(ref.path) || { exists: false, data: () => undefined };
    },
    delete(ref) {
      guard.markWrite?.();
      store.delete(ref.path);
    },
    set(ref, data) {
      guard.markWrite?.();
      store.set(ref.path, { exists: true, data: () => data });
    },
  };
}

{
  let pending = {
    uid: "uid_a",
    token: OLD,
    installationId: INST,
    proof: HMAC,
  };
  let liveUid = "uid_a";
  const events = [];
  const deps = {
    liveUid: () => liveUid,
    readPending: () => pending,
    clearPending: () => {
      pending = null;
    },
    flushCall: async () => {
      events.push("flush");
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    registerCall: async () => {
      events.push("register");
    },
  };
  const raced = pipeline.runSerializedEnable(INST, deps, {
    uid: "uid_a",
    token: NEXT,
    proof: HMAC,
    currentToken: NEXT,
  });
  const result = await Promise.race([
    raced,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("deadlock_timeout")), 2000),
    ),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(events, ["flush", "register"]);
  assert.equal(pending, null);
}

{
  let pending = {
    uid: "uid_a",
    token: OLD,
    installationId: INST,
    proof: HMAC,
  };
  const failDeps = {
    liveUid: () => "uid_a",
    readPending: () => pending,
    clearPending: () => {
      pending = null;
    },
    flushCall: async () => {
      throw new Error("revoke_failed");
    },
    registerCall: async () => {
      throw new Error("should_not_register");
    },
  };
  const failed = await pipeline.runSerializedEnable(INST, failDeps, {
    uid: "uid_a",
    token: NEXT,
    proof: HMAC,
    currentToken: NEXT,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "callable");
  assert.equal(pending?.token, OLD);
}

{
  let liveUid = "uid_a";
  const staleDeps = {
    liveUid: () => liveUid,
    readPending: () => null,
    clearPending: () => undefined,
    flushCall: async () => undefined,
    registerCall: async () => {
      liveUid = "uid_b";
    },
  };
  const stale = await pipeline.reconcileThenRegisterUnlocked(staleDeps, {
    uid: "uid_a",
    token: NEXT,
    installationId: INST,
    proof: HMAC,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale");
}

{
  const store = new Map([
    [
      `fcmInstallations/${INST}`,
      {
        exists: true,
        data: () => ({ uid: "uid_b", tokenHash: "tok_b", proofHash: HMAC }),
      },
    ],
    [
      "usuarios/uid_a/fcmTokens/tok_a",
      { exists: true, data: () => ({ token: "x" }) },
    ],
  ]);
  const result = await compiled.unregisterFcmTokenInTransaction(memoryTx(store), {
    uid: "uid_a",
    tokenId: "tok_a",
    installationId: INST,
    proof: HMAC,
    expectedUid: "uid_a",
    validInstallationId: true,
  });
  assert.equal(result.error, "ownership_mismatch");
  assert.equal(store.has(`fcmInstallations/${INST}`), true);
  assert.equal(store.has("usuarios/uid_a/fcmTokens/tok_a"), true);
}

{
  const upgrade = compiled.decideInstallationProofUpdate({
    storedProof: "p_deadbeef",
    incomingProof: HMAC,
    prevUid: "uid_a",
    uid: "uid_a",
  });
  assert.equal(upgrade.ok, true);
  assert.equal(upgrade.upgrade, true);
  const takeover = compiled.decideInstallationProofUpdate({
    storedProof: "p_deadbeef",
    incomingProof: HMAC,
    prevUid: "uid_a",
    uid: "uid_b",
  });
  assert.equal(takeover.ok, false);
  assert.equal(takeover.error, "installation_proof_mismatch");
}

{
  const now = Date.now();
  const limited = compiled.assertDurableRateLimit({
    stamps: Array.from({ length: 8 }, () => now - 100),
    nowMs: now,
  });
  assert.equal(limited.ok, false);
  assert.equal(limited.error, "rate_limited");
}

const fcmSrc = fs.readFileSync(path.join(root, "src/lib/chat/fcmPush.ts"), "utf8");
const pipelineSrc = fs.readFileSync(path.join(root, "src/lib/chat/fcmEnablePipeline.ts"), "utf8");
assert.match(fcmSrc, /reconcilePendingForEnable/);
assert.match(fcmSrc, /PushNotifications.unregister/);
assert.match(fcmSrc, /authCallbackChain/);
assert.match(fcmSrc, /withInstallationLock/);
assert.match(fcmSrc, /reconcileThenRegisterUnlocked/);
assert.match(fcmSrc, /isValidInstallationProof/);
assert.match(fcmSrc, /generateInstallationSecret/);
assert.match(fcmSrc, /reason: "stale"|reason: upserted.reason/);
assert.match(fcmSrc, /if \(options\?\.skipAutoEnable\) return;/);
assert.match(
  fcmSrc,
  /if \(!areChatNotificationsEnabled\(\)\) \{\s*\n\s*await flushPendingFcmUnregister\(\);/,
);
assert.doesNotMatch(pipelineSrc, /heldInstallationLocks/);
assert.match(pipelineSrc, /flushPendingUnlocked/);
const flushFn = pipelineSrc.slice(
  pipelineSrc.indexOf("export async function flushPendingUnlocked"),
  pipelineSrc.indexOf("export async function reconcileThenRegisterUnlocked"),
);
const reconcileFn = pipelineSrc.slice(
  pipelineSrc.indexOf("export async function reconcileThenRegisterUnlocked"),
  pipelineSrc.indexOf("export async function runSerializedEnable"),
);
assert.doesNotMatch(flushFn, /withInstallationLock/);
assert.doesNotMatch(reconcileFn, /withInstallationLock/);
for (const body of fcmSrc.matchAll(/withInstallationLock\([^,]+,\s*async \(\) => \{([\s\S]*?)\n  \}\);/g)) {
  assert.doesNotMatch(body[1], /withInstallationLock/);
  assert.doesNotMatch(body[1], /flushPendingFcmUnregister\(/);
  assert.doesNotMatch(body[1], /upsertFcmTokenForUser\(/);
  assert.doesNotMatch(body[1], /reconcilePendingForEnable\(/);
}

const fnIndex = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
assert.match(fnIndex, /isValidInstallationProof\(proof\)/);
assert.match(fnIndex, /assertDurableRateLimit|fcmRateLimits/);
assert.match(fnIndex, /registerFcmTokenInTransaction/);
assert.doesNotMatch(fnIndex, /FCM_ENFORCE_APP_CHECK/);
assert.doesNotMatch(fnIndex, /enforceAppCheck/);
assert.doesNotMatch(fnIndex, /makeInstallationProof/);
assert.doesNotMatch(fnIndex, /new Map<\s*string,\s*number/);

{
  pipeline.resetInstallationLockStats();
  const order = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const first = pipeline.withInstallationLock(INST, async () => {
    order.push("a-start");
    await sleep(40);
    order.push("a-end");
    return "a";
  });
  const second = pipeline.withInstallationLock(INST, async () => {
    order.push("b-start");
    await sleep(10);
    order.push("b-end");
    return "b";
  });
  const finished = await Promise.race([
    Promise.all([first, second]),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("deadlock_timeout")), 2000),
    ),
  ]);
  assert.deepEqual(finished, ["a", "b"]);
  assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
  assert.equal(pipeline.peekInstallationLockStats(INST).maxActive, 1);
}

{
  pipeline.resetInstallationLockStats();
  let pending = {
    uid: "uid_a",
    token: OLD,
    installationId: INST,
    proof: HMAC,
  };
  const events = [];
  const deps = {
    liveUid: () => "uid_a",
    readPending: () => pending,
    clearPending: () => {
      pending = null;
    },
    flushCall: async () => {
      events.push("flush");
      await new Promise((resolve) => setTimeout(resolve, 30));
    },
    registerCall: async () => {
      events.push("register");
    },
  };
  const rotated = Promise.all([
    pipeline.runSerializedEnable(INST, deps, {
      uid: "uid_a",
      token: NEXT,
      proof: HMAC,
      currentToken: OLD,
    }),
    pipeline.runSerializedEnable(INST, deps, {
      uid: "uid_a",
      token: NEXT,
      proof: HMAC,
      currentToken: NEXT,
    }),
  ]);
  const results = await Promise.race([
    rotated,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("deadlock_timeout")), 2000),
    ),
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, true);
  assert.equal(pipeline.peekInstallationLockStats(INST).maxActive, 1);
  assert.ok(events.includes("flush"));
  assert.ok(events.includes("register"));
  assert.equal(pending, null);
}

{
  let pending = {
    uid: "uid_a",
    token: OLD,
    installationId: INST,
    proof: HMAC,
  };
  const deleted = [];
  const switchDeps = {
    liveUid: () => "uid_b",
    readPending: () => pending,
    clearPending: () => {
      pending = null;
    },
    flushCall: async (input) => {
      deleted.push(input.token);
    },
    registerCall: async () => {
      deleted.push("register");
    },
  };
  const flushed = await pipeline.flushPendingUnlocked(switchDeps, {
    currentUid: "uid_a",
    installationId: INST,
    currentToken: "",
    proof: HMAC,
  });
  assert.equal(flushed, false);
  assert.deepEqual(deleted, []);
  assert.equal(pending?.token, OLD);
  const claimed = await pipeline.reconcileThenRegisterUnlocked(switchDeps, {
    uid: "uid_b",
    token: NEXT,
    installationId: INST,
    proof: HMAC,
  });
  assert.equal(claimed.ok, true);
  assert.ok(!deleted.includes(OLD), "pending A must not delete mapping while registering B");

  pipeline.resetInstallationLockStats();
  let liveUid = "uid_a";
  const cross = [];
  const crossDeps = {
    liveUid: () => liveUid,
    readPending: () => pending,
    clearPending: () => {
      pending = null;
    },
    flushCall: async (input) => {
      cross.push(`flush:${input.token}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
    registerCall: async (input) => {
      cross.push(`register:${input.uid}`);
    },
  };
  pending = {
    uid: "uid_a",
    token: OLD,
    installationId: INST,
    proof: HMAC,
  };
  const switchRace = Promise.all([
    pipeline.withInstallationLock(INST, () =>
      pipeline.flushPendingUnlocked(crossDeps, {
        currentUid: "uid_a",
        installationId: INST,
        proof: HMAC,
      }),
    ),
    (async () => {
      liveUid = "uid_b";
      return pipeline.runSerializedEnable(INST, crossDeps, {
        uid: "uid_b",
        token: NEXT,
        proof: HMAC,
      });
    })(),
  ]);
  const switchResult = await Promise.race([
    switchRace,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("deadlock_timeout")), 2000),
    ),
  ]);
  assert.equal(pipeline.peekInstallationLockStats(INST).maxActive, 1);
  assert.equal(switchResult[1].ok, true);
  assert.ok(!cross.includes(`flush:${NEXT}`));
}

{
  let pending = {
    uid: "uid_a",
    token: OLD,
    installationId: INST,
    proof: HMAC,
  };
  let attempts = 0;
  const durableDeps = {
    liveUid: () => "uid_a",
    readPending: () => pending,
    clearPending: () => {
      pending = null;
    },
    flushCall: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
    },
    registerCall: async () => undefined,
  };
  let first = false;
  try {
    first = await pipeline.flushPendingUnlocked(durableDeps, {
      currentUid: "uid_a",
      installationId: INST,
      proof: HMAC,
    });
  } catch {
    first = false;
  }
  assert.equal(first, false);
  assert.equal(pending?.token, OLD);
  const second = await pipeline.flushPendingUnlocked(durableDeps, {
    currentUid: "uid_a",
    installationId: INST,
    proof: HMAC,
  });
  assert.equal(second, true);
  assert.equal(attempts, 2);
}

{
  const owned = new Map([
    [
      `fcmInstallations/${INST}`,
      {
        exists: true,
        data: () => ({ uid: "uid_a", tokenHash: "tok_a", proofHash: HMAC }),
      },
    ],
    [
      "usuarios/uid_a/fcmTokens/tok_a",
      { exists: true, data: () => ({ token: "x" }) },
    ],
  ]);
  const writes = [];
  const reads = [];
  const guard = compiled.createReadBeforeWriteGuard();
  const tx = {
    async get(ref) {
      guard.assertCanRead();
      reads.push(ref.path);
      return owned.get(ref.path) || { exists: false, data: () => undefined };
    },
    delete(ref) {
      guard.markWrite();
      writes.push(ref.path);
      owned.delete(ref.path);
    },
    set() {
      guard.markWrite();
    },
  };
  const result = await compiled.unregisterFcmTokenInTransaction(tx, {
    uid: "uid_a",
    tokenId: "tok_a",
    installationId: INST,
    proof: HMAC,
    expectedUid: "uid_a",
    validInstallationId: true,
  });
  assert.equal(result.error, "");
  assert.ok(reads.length >= 2);
  assert.ok(writes.length > 0);
  const lastRead = Math.max(...reads.map((_, i) => i));
  const firstWriteAt = reads.length;
  assert.ok(lastRead < firstWriteAt + writes.length);
}

const prompt = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatNotificationPromptOpen.ts")).href
);
assert.equal(
  prompt.chatNotificationPromptOpen({
    loading: true,
    hasUser: true,
    profileReady: true,
    notificationApiReady: true,
    prompted: false,
  }),
  false,
);
assert.equal(
  prompt.chatNotificationPromptOpen({
    loading: false,
    hasUser: true,
    profileReady: false,
    notificationApiReady: true,
    prompted: false,
  }),
  false,
);
assert.equal(
  prompt.chatNotificationPromptOpen({
    loading: false,
    hasUser: true,
    profileReady: true,
    notificationApiReady: true,
    prompted: false,
  }),
  true,
);

assert.match(fcmSrc, /onNativePushForegroundResume/);
assert.match(
  fcmSrc,
  /if \(!user \|\| !areChatNotificationsEnabled\(\)\) \{\s*\n\s*await flushPendingFcmUnregister\(\);/,
);
assert.doesNotMatch(
  fcmSrc,
  /await flushPendingFcmUnregister\(\);\s*\n\s*if \(areChatNotificationsEnabled\(\)\) \{\s*\n\s*await reconcilePendingForEnable/,
);
const bootstrapSrc = fs.readFileSync(
  path.join(root, "src/components/app/NativeAppBootstrap.tsx"),
  "utf8",
);
assert.match(bootstrapSrc, /onNativePushForegroundResume/);
assert.match(fnIndex, /createReadBeforeWriteGuard/);
assert.match(fnIndex, /guard\.assertCanRead/);
const unregisterTxSrc = fs.readFileSync(
  path.join(root, "functions/src/fcmUnregisterTx.ts"),
  "utf8",
);
assert.match(unregisterTxSrc, /from "\.\/fcmTokenTx"/);
assert.doesNotMatch(unregisterTxSrc, /async function unregisterFcmTokenInTransaction/);

console.log("pass fcm_registration");
