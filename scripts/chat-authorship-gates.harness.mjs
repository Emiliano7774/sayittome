/**
 * Future authorship P0: live A→B, roleIdentityReady, infer O≠V.
 * Imports production authorshipGates.ts
 *
 * Usage: node --experimental-strip-types scripts/chat-authorship-gates.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gates = await import(
  pathToFileURL(path.join(root, "src/lib/chat/authorshipGates.ts")).href
);

const chatId = "anon_aaaa__anon_to__maria";
const threadA = "anon_aaaa";
const liveB = "anon_bbbb";
const ownerUid = "owner_uid_1";
const visitorUid = "visitor_uid_1";

function tuple(sender) {
  return {
    senderAuthUid: sender.senderAuthUid,
    senderProfileId: sender.senderProfileId,
    senderRole: sender.senderRole,
    fromUid: sender.fromUid,
  };
}

// A1 — A normal visitor: optimistic + persist + mine all use thread A.
{
  const built = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: "",
    threadAnonId: threadA,
    liveAnonId: threadA,
    chatId,
    profileUid: ownerUid,
  });
  assert.equal(built.ok, true);
  assert.deepEqual(tuple(built.sender), {
    senderAuthUid: "",
    senderProfileId: "",
    senderRole: "anon",
    fromUid: threadA,
  });
  assert.equal(
    gates.resolveProfileAnonMessageMine({
      from: threadA,
      threadAnonId: threadA,
      liveAnonId: threadA,
      profileUid: ownerUid,
      isOwnerViewing: false,
      senderRole: "anon",
      identityReady: true,
    }),
    true,
  );
}

// A1 — A→B: writer + optimistic use B; snapshot of B is still mine; thread A remains mine.
{
  const built = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: visitorUid,
    threadAnonId: threadA,
    liveAnonId: liveB,
    chatId,
    profileUid: ownerUid,
  });
  assert.equal(built.ok, true);
  assert.equal(built.sender.fromUid, liveB);
  assert.equal(built.sender.senderRole, "anon");
  assert.equal(built.sender.senderAuthUid, visitorUid);

  const mineB = gates.resolveProfileAnonMessageMine({
    from: liveB,
    threadAnonId: threadA,
    liveAnonId: liveB,
    profileUid: ownerUid,
    isOwnerViewing: false,
    senderRole: "anon",
    senderAuthUid: visitorUid,
    ownerUid: visitorUid,
    identityReady: true,
  });
  const mineA = gates.resolveProfileAnonMessageMine({
    from: threadA,
    threadAnonId: threadA,
    liveAnonId: liveB,
    profileUid: ownerUid,
    isOwnerViewing: false,
    senderRole: "anon",
    identityReady: true,
  });
  assert.equal(mineB, true, "live B must stay mine after rotation");
  assert.equal(mineA, true, "thread A historical rows stay mine");
  assert.equal(
    gates.resolveMineFromCanonicalSender({
      senderRole: "anon",
      fromUid: liveB,
      viewerUid: visitorUid,
      isOwnerViewing: false,
      threadAnonId: threadA,
      liveAnonId: liveB,
      identityReady: true,
    }),
    true,
  );
}

// A2 — cold owner: authReady + liveUid but empty profile/username → block send.
{
  const cold = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: ownerUid,
    threadAnonId: threadA,
    chatId,
    profileUid: "",
    viewerUsername: "",
  });
  assert.equal(cold.ok, false);
  assert.equal(cold.error, "role_identity_not_ready");
  assert.equal(
    gates.isRoleIdentityReady({
      liveProfileUid: ownerUid,
      chatId,
      profileUid: "",
      viewerUsername: "",
      threadAnonId: threadA,
    }),
    false,
  );
}

// A2 — proven owner via slug can send profile_*.
{
  const owner = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: ownerUid,
    threadAnonId: threadA,
    chatId,
    viewerUsername: "maria",
    profileUid: ownerUid,
    explicitOwner: true,
  });
  assert.equal(owner.ok, true);
  assert.equal(owner.sender.senderRole, "profile");
  assert.equal(owner.sender.fromUid, `profile_${ownerUid}`);
}

// A3 — O≠V + corrupt profile_V row must NOT elevate visitor to owner.
{
  assert.equal(
    gates.inferOwnerViewingFromAuthors(visitorUid, ownerUid, [
      { fromUid: `profile_${visitorUid}` },
    ]),
    false,
  );
  assert.equal(
    gates.inferOwnerViewingFromAuthors(ownerUid, ownerUid, [
      { fromUid: `profile_${ownerUid}` },
    ]),
    true,
  );
  assert.equal(
    gates.inferOwnerViewingFromAuthors(ownerUid, "", [
      { fromUid: `profile_${ownerUid}` },
    ]),
    true,
  );
}

// Owner/profile/visitor anon mine stays stable.
{
  assert.equal(
    gates.resolveProfileAnonMessageMine({
      from: `profile_${ownerUid}`,
      threadAnonId: threadA,
      profileUid: ownerUid,
      isOwnerViewing: true,
      senderRole: "profile",
      ownerUid,
      senderAuthUid: ownerUid,
      identityReady: true,
    }),
    true,
  );
  assert.equal(
    gates.resolveProfileAnonMessageMine({
      from: `profile_${ownerUid}`,
      threadAnonId: threadA,
      profileUid: ownerUid,
      isOwnerViewing: false,
      senderRole: "profile",
      ownerUid: visitorUid,
      identityReady: true,
    }),
    false,
  );
}

const liveC = "anon_cccc";
const continuity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/threadAnonContinuity.ts")).href
);
const visitorScope = { rootAnonSessionId: "anon_scope_visitor", provenOwn: true };
continuity.resetThreadAnonContinuityForTests();
continuity.rememberThreadAnonId(chatId, threadA, visitorScope);
continuity.rememberThreadAnonId(chatId, liveB, visitorScope);
const knownAfterRotate = continuity.listThreadAnonIds(chatId, [threadA, liveC], visitorScope);
assert.equal(
  gates.resolveProfileAnonMessageMine({
    from: liveB,
    threadAnonId: threadA,
    liveAnonId: liveC,
    knownAnonIds: knownAfterRotate,
    profileUid: ownerUid,
    isOwnerViewing: false,
    senderRole: "anon",
    identityReady: true,
  }),
  true,
  "B stays mine after B->C when this device authored B",
);
assert.equal(
  gates.resolveProfileAnonMessageMine({
    from: liveB,
    threadAnonId: threadA,
    liveAnonId: liveC,
    knownAnonIds: [],
    profileUid: ownerUid,
    isOwnerViewing: false,
    senderRole: "anon",
    senderAuthUid: visitorUid,
    ownerUid: visitorUid,
    identityReady: true,
  }),
  true,
  "authenticated visitor keeps B via senderAuthUid",
);

assert.equal(
  gates.isRoleIdentityReady({
    liveProfileUid: ownerUid,
    chatId: `anon_aaaa__anon_to__${ownerUid}`,
    viewerUsername: "maria",
    profileUid: "",
    threadAnonId: threadA,
  }),
  false,
  "legacy UID slug + any username is not visitor proof",
);
assert.equal(
  gates.isRoleIdentityReady({
    liveProfileUid: ownerUid,
    chatId: "anon_aaaa__anon_to__oldmaria",
    viewerUsername: "newmaria",
    profileUid: "",
    threadAnonId: threadA,
  }),
  false,
  "changed username is not visitor proof",
);
assert.equal(
  gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: ownerUid,
    threadAnonId: threadA,
    chatId: "anon_aaaa__anon_to__oldmaria",
    viewerUsername: "newmaria",
    profileUid: "",
  }).ok,
  false,
);

assert.equal(gates.shouldHoldVisualAuthorship(false), true);
assert.equal(gates.shouldHoldVisualAuthorship(true), false);
assert.equal(
  gates.isRoleIdentityReady({
    liveProfileUid: visitorUid,
    chatId,
    viewerUsername: "visitorname",
    profileUid: "",
    threadAnonId: threadA,
  }),
  false,
  "auth-ready visitor without target metadata is not role-ready",
);

assert.equal(
  gates.isRoleIdentityReady({
    liveProfileUid: "",
    chatId,
    profileUid: ownerUid,
    threadAnonId: threadA,
  }),
  false,
  "empty liveUid without authReady is not visitor-ready",
);
assert.equal(
  gates.isRoleIdentityReady({
    liveProfileUid: "",
    chatId,
    profileUid: ownerUid,
    threadAnonId: threadA,
    authReady: false,
  }),
  false,
);
assert.equal(
  gates.buildCanonicalSender({
    authReady: false,
    liveProfileUid: "",
    threadAnonId: threadA,
    chatId,
    profileUid: ownerUid,
  }).ok,
  false,
  "writer stays disabled before auth resolves",
);
assert.equal(
  gates.isRoleIdentityReady({
    liveProfileUid: "",
    chatId,
    profileUid: ownerUid,
    threadAnonId: threadA,
    authReady: true,
  }),
  true,
  "signed-out visitor after authReady may use thread anon",
);

console.log(
  "pass authorship_gates",
  JSON.stringify({
    tupleA: { fromUid: threadA, senderRole: "anon" },
    tupleAB: { fromUid: liveB, senderRole: "anon", senderAuthUid: visitorUid },
    tupleBC: { fromUid: liveB, live: liveC, mine: true },
    mineStable: true,
    historicalApply: 0,
  }),
);
