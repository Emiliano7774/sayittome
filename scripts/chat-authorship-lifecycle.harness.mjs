/**
 * Deterministic send → snapshot cache/server → kill → reopen.
 * Covers profile↔profile (legacy) and profile↔Anon, including offline merge.
 *
 * Usage: node scripts/chat-authorship-lifecycle.harness.mjs
 */
import assert from "node:assert/strict";

function profileReplyAuthorId(uid) {
  const clean = String(uid || "").trim();
  return clean ? `profile_${clean}` : "profile_unknown";
}

function isProfileThreadOwner(input) {
  const authUid = String(input.authUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  if (authUid && profileUid && authUid === profileUid) return true;
  const hint = String(input.chatId || "").split("__anon_to__")[1] || "";
  const slug = String(input.viewerUsername || "").trim().toLowerCase();
  return Boolean(hint && slug && hint === slug);
}

function buildCanonicalSender(input) {
  if (!input.authReady) return { ok: false, error: "auth_not_ready" };
  const liveUid = String(input.liveProfileUid || "").trim();
  const threadAnon = String(input.threadAnonId || "").trim();
  const isOwner =
    input.explicitOwner === true && liveUid
      ? true
      : isProfileThreadOwner({
          chatId: input.chatId,
          authUid: liveUid,
          viewerUsername: input.viewerUsername,
        });
  if (isOwner) {
    if (!liveUid) return { ok: false, error: "owner_identity_not_ready" };
    return {
      ok: true,
      sender: {
        senderAuthUid: liveUid,
        senderProfileId: liveUid,
        senderRole: "profile",
        fromUid: profileReplyAuthorId(liveUid),
      },
    };
  }
  if (!threadAnon.startsWith("anon_")) {
    return { ok: false, error: "visitor_identity_not_ready" };
  }
  return {
    ok: true,
    sender: {
      senderAuthUid: liveUid,
      senderProfileId: "",
      senderRole: "anon",
      fromUid: threadAnon,
    },
  };
}

function buildLegacyCanonicalSender(input) {
  if (!input.authReady) return { ok: false, error: "auth_not_ready" };
  const liveUid = String(input.liveProfileUid || "").trim();
  if (!liveUid) return { ok: false, error: "owner_identity_not_ready" };
  return {
    ok: true,
    sender: {
      senderAuthUid: liveUid,
      senderProfileId: liveUid,
      senderRole: "profile",
      fromUid: liveUid,
    },
  };
}

function resolveMine(input) {
  const viewer = String(input.viewerUid || "").trim();
  const senderAuth = String(input.senderAuthUid || "").trim();
  const role = String(input.senderRole || "").trim();
  const from = String(input.fromUid || "").trim();
  if (viewer && senderAuth && senderAuth === viewer) return true;
  if (role === "profile") return input.isOwnerViewing === true;
  if (role === "anon") {
    if (!input.identityReady) return false;
    if (input.isOwnerViewing) return false;
    return Boolean(input.threadAnonId && from === input.threadAnonId);
  }
  return false;
}

function resolveLegacyMine(fromUid, viewerUid, senderAuthUid) {
  const viewer = String(viewerUid || "").trim();
  const senderAuth = String(senderAuthUid || "").trim();
  if (!viewer) return false;
  if (senderAuth && senderAuth === viewer) return true;
  return String(fromUid || "") === viewer;
}

function mergeLoaded(loaded, pending) {
  const merged = loaded.map((row) => ({ ...row }));
  const claimed = new Set();
  for (const optimistic of pending) {
    let match = -1;
    if (optimistic.clientId) {
      match = merged.findIndex(
        (row, index) => !claimed.has(index) && row.clientId === optimistic.clientId,
      );
    }
    if (match < 0) {
      match = merged.findIndex(
        (row, index) =>
          !claimed.has(index) &&
          optimistic.mine &&
          row.mine &&
          row.fromUid === optimistic.fromUid &&
          row.text === optimistic.text,
      );
    }
    if (match >= 0) claimed.add(match);
    else merged.push(optimistic);
  }
  return merged;
}

const OWNER = "ownerUid123";
const PEER = "peerUid456";
const CHAT = "anon_visitor1__anon_to__alice";
const THREAD_ANON = "anon_visitor1";

function simulateKillReopen(serverDocs, viewer) {
  const cache = serverDocs.map((doc) => ({ ...doc }));
  const afterKill = cache.map((doc) => ({
    ...doc,
    mine: resolveMine({
      ...doc,
      viewerUid: "",
      isOwnerViewing: false,
      identityReady: false,
      threadAnonId: THREAD_ANON,
    }),
  }));
  const afterReopen = cache.map((doc) => ({
    ...doc,
    mine: resolveMine({
      ...doc,
      viewerUid: viewer.uid,
      isOwnerViewing: viewer.owner,
      identityReady: true,
      threadAnonId: THREAD_ANON,
    }),
  }));
  return { cache, afterKill, afterReopen };
}

// Block send until identity ready
assert.equal(
  buildCanonicalSender({
    authReady: false,
    liveProfileUid: OWNER,
    threadAnonId: THREAD_ANON,
    chatId: CHAT,
    viewerUsername: "alice",
  }).ok,
  false,
);
assert.equal(
  buildCanonicalSender({
    authReady: true,
    liveProfileUid: "",
    threadAnonId: THREAD_ANON,
    chatId: CHAT,
    viewerUsername: "alice",
    explicitOwner: true,
  }).error,
  "owner_identity_not_ready",
);
assert.equal(
  buildCanonicalSender({
    authReady: true,
    liveProfileUid: "",
    threadAnonId: "",
    chatId: CHAT,
  }).error,
  "visitor_identity_not_ready",
);

// profile↔Anon owner send → cache/server → kill → reopen
{
  const sent = buildCanonicalSender({
    authReady: true,
    liveProfileUid: OWNER,
    threadAnonId: THREAD_ANON,
    chatId: CHAT,
    viewerUsername: "alice",
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.sender.fromUid, profileReplyAuthorId(OWNER));
  assert.equal(sent.sender.senderRole, "profile");
  const server = [
    {
      id: "m1",
      clientId: "c1",
      text: "hola",
      ...sent.sender,
    },
    {
      id: "m2",
      clientId: "c2",
      text: "visita",
      senderAuthUid: "",
      senderRole: "anon",
      fromUid: THREAD_ANON,
    },
  ];
  const cycle = simulateKillReopen(server, { uid: OWNER, owner: true });
  assert.deepEqual(
    cycle.afterReopen.map((row) => row.mine),
    [true, false],
    "owner kill/reopen keeps profile mine and visitor peer",
  );
  assert.deepEqual(
    cycle.afterKill.map((row) => row.mine),
    [false, false],
    "owner kill before identity does not treat thread anon as mine",
  );
}

// profile↔Anon visitor send → kill → reopen
{
  const sent = buildCanonicalSender({
    authReady: true,
    liveProfileUid: "",
    threadAnonId: THREAD_ANON,
    chatId: CHAT,
  });
  assert.equal(sent.sender.fromUid, THREAD_ANON);
  assert.equal(sent.sender.senderRole, "anon");
  const server = [
    { id: "m1", ...sent.sender, text: "visita" },
    {
      id: "m2",
      senderAuthUid: OWNER,
      senderRole: "profile",
      fromUid: profileReplyAuthorId(OWNER),
      text: "owner",
    },
  ];
  const cycle = simulateKillReopen(server, { uid: "", owner: false });
  assert.deepEqual(cycle.afterReopen.map((row) => row.mine), [true, false]);
}

// New senderRole beats corrupt historical fromUid for FUTURE rows
assert.equal(
  resolveMine({
    senderAuthUid: OWNER,
    senderRole: "profile",
    fromUid: THREAD_ANON,
    viewerUid: OWNER,
    isOwnerViewing: true,
    identityReady: true,
    threadAnonId: THREAD_ANON,
  }),
  true,
);

// Historical without senderRole stays unclassified here (no auto invert)
assert.equal(
  resolveMine({
    fromUid: THREAD_ANON,
    viewerUid: OWNER,
    isOwnerViewing: true,
    identityReady: true,
    threadAnonId: THREAD_ANON,
  }),
  false,
);

// profile↔profile legacy
{
  const a = buildLegacyCanonicalSender({ authReady: true, liveProfileUid: OWNER });
  const b = buildLegacyCanonicalSender({ authReady: true, liveProfileUid: PEER });
  assert.equal(a.sender.fromUid, OWNER);
  const server = [
    { id: "l1", ...a.sender, text: "a" },
    { id: "l2", ...b.sender, text: "b" },
  ];
  const afterReopenA = server.map((doc) =>
    resolveLegacyMine(doc.fromUid, OWNER, doc.senderAuthUid),
  );
  const afterReopenB = server.map((doc) =>
    resolveLegacyMine(doc.fromUid, PEER, doc.senderAuthUid),
  );
  assert.deepEqual(afterReopenA, [true, false]);
  assert.deepEqual(afterReopenB, [false, true]);
  assert.equal(
    buildLegacyCanonicalSender({ authReady: true, liveProfileUid: "" }).ok,
    false,
  );
}

// Offline optimistic merge by clientId, not by late targetUid
{
  const sent = buildCanonicalSender({
    authReady: true,
    liveProfileUid: OWNER,
    threadAnonId: THREAD_ANON,
    chatId: CHAT,
    viewerUsername: "alice",
  });
  const optimistic = {
    id: "local",
    clientId: "cid-9",
    text: "offline",
    mine: true,
    ...sent.sender,
  };
  const server = [
    {
      id: "srv",
      clientId: "cid-9",
      text: "offline",
      mine: true,
      ...sent.sender,
    },
  ];
  const merged = mergeLoaded(server, [optimistic]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "srv");
  assert.equal(merged[0].senderRole, "profile");
}

console.log(
  JSON.stringify(
    {
      gate: "CHAT_AUTHORSHIP_LIFECYCLE",
      pass: true,
      cases: [
        "block_until_identity",
        "profile_anon_owner_kill_reopen",
        "profile_anon_visitor_kill_reopen",
        "senderRole_beats_corrupt_fromUid",
        "historical_without_role_not_auto_fixed",
        "legacy_profile_profile",
        "offline_clientId_merge",
      ],
    },
    null,
    2,
  ),
);
