/**
 * VIEW_ONCE_MEDIA_DELIVER
 * Real handler concurrency/replay: atomic grant reserve before bytes; restore on upstream fail.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessAlias(root);

const deliver = await import(
  pathToFileURL(path.join(root, "src/lib/media/viewOnceMediaDeliver.ts")).href
);
const access = await import(
  pathToFileURL(path.join(root, "src/lib/media/viewOnceMediaAccess.ts")).href
);

const goodUrl =
  "https://firebasestorage.googleapis.com/v0/b/sayittome-app.firebasestorage.app/o/chats%2Fc1%2Fbomb.jpg?alt=media";
const secretPath = `${deliver.VIEW_ONCE_SECRETS_COLLECTION}/c1_m1`;
const FIELD_DELETE = deliver.VIEW_ONCE_FIELD_DELETE;

function applyFieldDeletes(data) {
  const next = { ...data };
  for (const [key, value] of Object.entries(next)) {
    if (value === FIELD_DELETE) delete next[key];
  }
  return next;
}

/**
 * Optimistic-concurrency fake Firestore:
 * concurrent txs can both read the same snapshot; only one commit wins, losers retry.
 */
function createRacingDb(initial, options = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, v ? { ...v } : v]));
  let version = 0;
  let activeReaders = 0;
  let releaseBarrier = null;
  const readerBarrier =
    options.barrierReaders > 0
      ? new Promise((resolve) => {
          releaseBarrier = resolve;
        })
      : null;

  function makeRef(pathName) {
    return { path: pathName };
  }

  const db = {
    collection(name) {
      return {
        doc(id) {
          return makeRef(`${name}/${id}`);
        },
      };
    },
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const versionAtStart = version;
        const snapshot = new Map(
          [...store.entries()].map(([k, v]) => [k, v ? { ...v } : v]),
        );
        const writes = [];

        const tx = {
          async get(ref) {
            if (readerBarrier) {
              activeReaders += 1;
              if (activeReaders >= options.barrierReaders) releaseBarrier?.();
              await readerBarrier;
            }
            const data = snapshot.get(ref.path);
            return {
              exists: data !== undefined,
              data: () => (data ? { ...data } : undefined),
            };
          },
          set(ref, data, opts) {
            writes.push({ type: "set", path: ref.path, data: { ...data }, merge: Boolean(opts?.merge) });
          },
          delete(ref) {
            writes.push({ type: "delete", path: ref.path });
          },
        };

        const result = await fn(tx);
        // Yield so a peer transaction can also observe the pre-commit snapshot.
        await Promise.resolve();
        await Promise.resolve();

        if (version !== versionAtStart) {
          continue; // contention → retry like Firestore
        }

        for (const write of writes) {
          if (write.type === "delete") {
            store.delete(write.path);
            continue;
          }
          const prev = store.get(write.path) || {};
          const merged = write.merge ? { ...prev, ...write.data } : { ...write.data };
          store.set(write.path, applyFieldDeletes(merged));
        }
        version += 1;
        return result;
      }
      throw new Error("transaction_failed");
    },
  };

  return {
    db,
    store,
    getSecret: () => store.get(secretPath),
  };
}

function seedGrant(extra = {}) {
  return {
    mediaUrl: goodUrl,
    deliveryUid: "member",
    deliveryExpiresAtMs: Date.now() + 60_000,
    deliveryConsumeSecret: false,
    ...extra,
  };
}

const bytes = new TextEncoder().encode("bomb-bytes").buffer;

// --- Concurrent POSTs: only one claim delivery may succeed ---
{
  const racing = createRacingDb({ [secretPath]: seedGrant() }, { barrierReaders: 2 });
  let fetches = 0;
  const fetchMedia = async () => {
    fetches += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true, status: 200, contentType: "image/jpeg", body: bytes };
  };

  const [a, b] = await Promise.all([
    deliver.executeViewOnceMediaDelivery({
      db: racing.db,
      uid: "member",
      body: { chatId: "c1", messageId: "m1" },
      fieldDelete: FIELD_DELETE,
      fetchMedia,
    }),
    deliver.executeViewOnceMediaDelivery({
      db: racing.db,
      uid: "member",
      body: { chatId: "c1", messageId: "m1" },
      fieldDelete: FIELD_DELETE,
      fetchMedia,
    }),
  ]);

  const wins = [a, b].filter((row) => row.ok);
  const denied = [a, b].filter((row) => !row.ok && row.gate === "DENIED");
  assert.equal(wins.length, 1, "exactly one concurrent delivery ALLOWED");
  assert.equal(denied.length, 1, "peer concurrent delivery DENIED");
  assert.equal(fetches, 1, "upstream fetched once");
  assert.equal(racing.getSecret()?.deliveryUid, undefined);
}

// --- Replay after success is DENIED ---
{
  const dbWrap = createRacingDb({ [secretPath]: seedGrant() });
  const first = await deliver.executeViewOnceMediaDelivery({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    fetchMedia: async () => ({ ok: true, status: 200, contentType: "image/jpeg", body: bytes }),
  });
  assert.equal(first.ok, true);

  const replay = await deliver.executeViewOnceMediaDelivery({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    fetchMedia: async () => {
      throw new Error("should_not_fetch_on_replay");
    },
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.gate, "DENIED");
  assert.equal(replay.error, "not_member_claim");
}

// --- Upstream fail restores grant; retry ALLOWED ---
{
  const dbWrap = createRacingDb({ [secretPath]: seedGrant({ deliveryConsumeSecret: true }) });
  let calls = 0;
  const failThenOk = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 500, contentType: "", body: null };
    return { ok: true, status: 200, contentType: "image/jpeg", body: bytes };
  };

  const failed = await deliver.executeViewOnceMediaDelivery({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    fetchMedia: failThenOk,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, "media_fetch_failed");
  assert.equal(dbWrap.getSecret()?.deliveryUid, "member", "grant restored after upstream fail");

  const retry = await deliver.executeViewOnceMediaDelivery({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    fetchMedia: failThenOk,
  });
  assert.equal(retry.ok, true);
  assert.equal(dbWrap.getSecret(), undefined, "exhausted secret deleted after successful finalize");
}

// --- Foreign uid DENIED even with live grant ---
{
  const dbWrap = createRacingDb({ [secretPath]: seedGrant() });
  const foreign = await deliver.executeViewOnceMediaDelivery({
    db: dbWrap.db,
    uid: "intruder",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    fetchMedia: async () => {
      throw new Error("foreign_must_not_fetch");
    },
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.gate, "DENIED");
  assert.equal(dbWrap.getSecret()?.deliveryUid, "member");
}

// --- Upstream fail restores grant with ORIGINAL expiry (no TTL extension) ---
{
  const originalExpiry = Date.now() + 45_000;
  const dbWrap = createRacingDb({
    [secretPath]: seedGrant({ deliveryExpiresAtMs: originalExpiry }),
  });
  const failed = await deliver.executeViewOnceMediaDelivery({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    nowMs: Date.now(),
    fetchMedia: async () => ({ ok: false, status: 500, contentType: "", body: null }),
  });
  assert.equal(failed.ok, false);
  assert.equal(dbWrap.getSecret()?.deliveryUid, "member");
  assert.equal(
    dbWrap.getSecret()?.deliveryExpiresAtMs,
    originalExpiry,
    "restore must keep original expiry, not now+TTL",
  );
}

// --- Expired grant: cleanup reservation / exhausted secret when still owner ---
{
  const pastExpiry = Date.now() - 1_000;

  // consumeSecret=false → clear reservationId only, keep mediaUrl
  {
    const dbWrap = createRacingDb({
      [secretPath]: seedGrant({ deliveryExpiresAtMs: pastExpiry + 60_000 }),
    });
    const reservedAt = pastExpiry - 30_000;
    const raceReserve = await deliver.reserveViewOnceMediaGrant({
      db: dbWrap.db,
      uid: "member",
      body: { chatId: "c1", messageId: "m1" },
      fieldDelete: FIELD_DELETE,
      nowMs: reservedAt,
      createReservationId: () => "res-exp-keep",
    });
    assert.equal(raceReserve.status, "ALLOWED");
    assert.equal(dbWrap.getSecret()?.deliveryReservationId, "res-exp-keep");
    raceReserve.reserved.grant.deliveryExpiresAtMs = pastExpiry;
    const restored = await deliver.restoreViewOnceMediaGrant({
      db: dbWrap.db,
      reserved: raceReserve.reserved,
      fieldDelete: FIELD_DELETE,
      nowMs: Date.now(),
    });
    assert.equal(restored.restored, false);
    assert.equal(restored.reason, "expired");
    assert.equal(restored.cleaned, true);
    assert.equal(dbWrap.getSecret()?.deliveryUid, undefined, "expired must not re-arm deliveryUid");
    assert.equal(dbWrap.getSecret()?.deliveryReservationId, undefined, "reservation stamp cleared");
    assert.equal(dbWrap.getSecret()?.mediaUrl, goodUrl, "mediaUrl kept for future claims");
  }

  // consumeSecret=true → delete orphan exhausted secret
  {
    const dbWrap = createRacingDb({
      [secretPath]: seedGrant({
        deliveryExpiresAtMs: pastExpiry + 60_000,
        deliveryConsumeSecret: true,
      }),
    });
    const reservedAt = pastExpiry - 30_000;
    const raceReserve = await deliver.reserveViewOnceMediaGrant({
      db: dbWrap.db,
      uid: "member",
      body: { chatId: "c1", messageId: "m1" },
      fieldDelete: FIELD_DELETE,
      nowMs: reservedAt,
      createReservationId: () => "res-exp-delete",
    });
    assert.equal(raceReserve.status, "ALLOWED");
    raceReserve.reserved.grant.deliveryExpiresAtMs = pastExpiry;
    const restored = await deliver.restoreViewOnceMediaGrant({
      db: dbWrap.db,
      reserved: raceReserve.reserved,
      fieldDelete: FIELD_DELETE,
      nowMs: Date.now(),
    });
    assert.equal(restored.restored, false);
    assert.equal(restored.reason, "expired");
    assert.equal(restored.cleaned, true);
    assert.equal(dbWrap.getSecret(), undefined, "exhausted secret deleted on expired cleanup");
  }

  // Expired but B already superseded → do not touch B
  {
    const dbWrap = createRacingDb({
      [secretPath]: seedGrant({ deliveryExpiresAtMs: pastExpiry + 60_000 }),
    });
    const reservedAt = pastExpiry - 30_000;
    const raceReserve = await deliver.reserveViewOnceMediaGrant({
      db: dbWrap.db,
      uid: "member",
      body: { chatId: "c1", messageId: "m1" },
      fieldDelete: FIELD_DELETE,
      nowMs: reservedAt,
      createReservationId: () => "res-exp-b",
    });
    assert.equal(raceReserve.status, "ALLOWED");
    raceReserve.reserved.grant.deliveryExpiresAtMs = pastExpiry;
    const grantB = {
      mediaUrl: goodUrl,
      deliveryUid: "member-b",
      deliveryExpiresAtMs: Date.now() + 90_000,
      deliveryConsumeSecret: false,
    };
    dbWrap.store.set(secretPath, { ...grantB });
    const restored = await deliver.restoreViewOnceMediaGrant({
      db: dbWrap.db,
      reserved: raceReserve.reserved,
      fieldDelete: FIELD_DELETE,
      nowMs: Date.now(),
    });
    assert.equal(restored.restored, false);
    assert.equal(restored.reason, "superseded");
    assert.equal(restored.cleaned, false);
    assert.equal(dbWrap.getSecret()?.deliveryUid, "member-b");
    assert.equal(dbWrap.getSecret()?.deliveryExpiresAtMs, grantB.deliveryExpiresAtMs);
  }
}

// Pure expiry helper.
{
  const now = 1_700_000_000_000;
  const keep = deliver.resolveViewOnceGrantRestoreExpiry({
    originalExpiresAtMs: now + 10_000,
    nowMs: now,
  });
  assert.equal(keep.ok, true);
  assert.equal(keep.deliveryExpiresAtMs, now + 10_000);

  const expired = deliver.resolveViewOnceGrantRestoreExpiry({
    originalExpiresAtMs: now - 1,
    nowMs: now,
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, "expired");
}

// Route must load Admin FieldValue via firebaseAdminNative (bundler-safe).
{
  const fs = await import("node:fs");
  const routeSrc = fs.readFileSync(
    path.join(root, "src/app/api/view-once/media/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /loadFirebaseAdminFirestore/);
  assert.match(routeSrc, /firebaseAdminNative/);
  assert.doesNotMatch(
    routeSrc,
    /import\s*\(\s*["']firebase-admin(?:\/[^"']*)?["']\s*\)/,
  );
  assert.doesNotMatch(routeSrc, /from\s+["']firebase-admin/);
}

// --- Claim B before restore A: B's grant survives ---
{
  const dbWrap = createRacingDb({ [secretPath]: seedGrant() });
  const reservedA = await deliver.reserveViewOnceMediaGrant({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    createReservationId: () => "res-A",
  });
  assert.equal(reservedA.status, "ALLOWED");
  assert.equal(dbWrap.getSecret()?.deliveryReservationId, "res-A");
  assert.equal(dbWrap.getSecret()?.deliveryUid, undefined);

  // Later claim B writes a fresh grant and clears A's reservation (as CF does).
  const grantB = {
    mediaUrl: goodUrl,
    deliveryUid: "member-b",
    deliveryExpiresAtMs: Date.now() + 90_000,
    deliveryConsumeSecret: false,
  };
  dbWrap.store.set(secretPath, { ...grantB });

  const restored = await deliver.restoreViewOnceMediaGrant({
    db: dbWrap.db,
    reserved: reservedA.reserved,
    fieldDelete: FIELD_DELETE,
    nowMs: Date.now(),
  });
  assert.equal(restored.restored, false);
  assert.equal(restored.reason, "superseded");
  assert.equal(dbWrap.getSecret()?.deliveryUid, "member-b", "grant B must survive restore A");
  assert.equal(dbWrap.getSecret()?.deliveryExpiresAtMs, grantB.deliveryExpiresAtMs);
  assert.equal(dbWrap.getSecret()?.deliveryReservationId, undefined);
}

// --- Claim B before finalize A (consumeSecret): B's secret/grant survives ---
{
  const dbWrap = createRacingDb({
    [secretPath]: seedGrant({ deliveryConsumeSecret: true }),
  });
  const reservedA = await deliver.reserveViewOnceMediaGrant({
    db: dbWrap.db,
    uid: "member",
    body: { chatId: "c1", messageId: "m1" },
    fieldDelete: FIELD_DELETE,
    createReservationId: () => "res-A-final",
  });
  assert.equal(reservedA.status, "ALLOWED");
  assert.equal(reservedA.reserved.consumeSecret, true);

  const grantB = {
    mediaUrl: goodUrl,
    deliveryUid: "member-b",
    deliveryExpiresAtMs: Date.now() + 90_000,
    deliveryConsumeSecret: true,
  };
  dbWrap.store.set(secretPath, { ...grantB });

  const finalized = await deliver.finalizeViewOnceMediaGrant({
    db: dbWrap.db,
    reserved: reservedA.reserved,
    fieldDelete: FIELD_DELETE,
  });
  assert.equal(finalized.finalized, false);
  assert.equal(finalized.reason, "superseded");
  assert.deepEqual(
    {
      deliveryUid: dbWrap.getSecret()?.deliveryUid,
      deliveryExpiresAtMs: dbWrap.getSecret()?.deliveryExpiresAtMs,
      deliveryConsumeSecret: dbWrap.getSecret()?.deliveryConsumeSecret,
      mediaUrl: dbWrap.getSecret()?.mediaUrl,
    },
    grantB,
    "grant B must survive finalize A",
  );
}

assert.equal(
  deliver.isViewOnceReservationOwner({
    doc: { deliveryReservationId: "res-A" },
    reservationId: "res-A",
  }),
  true,
);
assert.equal(
  deliver.isViewOnceReservationOwner({
    doc: { deliveryReservationId: "res-B" },
    reservationId: "res-A",
  }),
  false,
);

// Pure gate still holds.
assert.equal(
  access.decideViewOnceMediaAccess({
    uid: "member",
    body: { chatId: "c1", messageId: "m1", mediaUrl: goodUrl },
    delivery: seedGrant(),
  }).status,
  "DENIED",
);

console.log(
  JSON.stringify(
    {
      gate: "VIEW_ONCE_MEDIA_DELIVER",
      pass: true,
      results: {
        concurrent_replay: "DENIED_peer",
        replay_after_success: "DENIED",
        upstream_fail_restore: "ALLOWED_retry",
        restore_keeps_original_expiry: "ALLOWED",
        restore_expired_cleanup_keep_media: "ALLOWED",
        restore_expired_cleanup_delete_secret: "ALLOWED",
        restore_expired_b_survives: "ALLOWED",
        b_before_restore_a_survives: "ALLOWED",
        b_before_finalize_a_survives: "ALLOWED",
        route_firebase_admin_native: "ALLOWED",
        auth_ajeno: "DENIED",
      },
    },
    null,
    2,
  ),
);
