/**
 * UI/listener/cache→server/clientId + text/media/story/offline/legacy.
 * Imports production authorshipGates, profileAnonMessageAuthor, profileChatResolveKey.
 *
 * Usage: node --experimental-strip-types scripts/chat-authorship-lifecycle.harness.mjs
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

const gates = await import(
  pathToFileURL(path.join(root, "src/lib/chat/authorshipGates.ts")).href
);
const author = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts")).href
);
const cacheKey = await import(
  pathToFileURL(path.join(root, "src/lib/chat/profileChatResolveKey.ts")).href
);
const continuity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/threadAnonContinuity.ts")).href
);
const chatIdMod = await import(
  pathToFileURL(path.join(root, "src/lib/chat/anonChatId.ts")).href
);

const chatId = "anon_aaaa__anon_to__maria";
const threadA = "anon_aaaa";
const liveB = "anon_bbbb";
const ownerUid = "owner_1";

function persistAndReopen(sender, threadAnonId, liveAnonId, viewer) {
  return gates.resolveProfileAnonMessageMine({
    from: sender.fromUid,
    threadAnonId,
    liveAnonId,
    profileUid: viewer.profileUid,
    isOwnerViewing: viewer.isOwnerViewing,
    ownerUid: viewer.ownerUid,
    senderAuthUid: sender.senderAuthUid,
    senderRole: sender.senderRole,
    identityReady: true,
  });
}

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
  assert.equal(
    persistAndReopen(built.sender, threadA, threadA, {
      profileUid: ownerUid,
      isOwnerViewing: false,
      ownerUid: "",
    }),
    true,
  );
}

{
  const built = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: "visitor_1",
    threadAnonId: threadA,
    liveAnonId: liveB,
    chatId,
    profileUid: ownerUid,
  });
  assert.equal(built.ok, true);
  assert.equal(built.sender.fromUid, liveB);
  assert.equal(
    persistAndReopen(built.sender, threadA, liveB, {
      profileUid: ownerUid,
      isOwnerViewing: false,
      ownerUid: "visitor_1",
    }),
    true,
  );
}

{
  const offline = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: "",
    threadAnonId: threadA,
    liveAnonId: liveB,
    chatId,
    profileUid: ownerUid,
  });
  assert.equal(offline.ok, true);
  assert.equal(offline.sender.fromUid, liveB);
}

// A6 — sequential auth pending → owner UID → late metadata. No visible flip.
{
  const cached = [
    {
      fromUid: `profile_${ownerUid}`,
      senderKind: "profile",
      senderRole: "profile",
      senderAuthUid: ownerUid,
      mine: true,
    },
    {
      fromUid: threadA,
      senderKind: "anon",
      senderRole: "anon",
      mine: false,
    },
  ];

  const pendingReady = gates.isRoleIdentityReady({
    liveProfileUid: "",
    chatId,
    profileUid: "",
    threadAnonId: threadA,
    authReady: false,
  });
  assert.equal(pendingReady, false);
  assert.equal(
    gates.buildCanonicalSender({
      authReady: false,
      liveProfileUid: "",
      threadAnonId: threadA,
      chatId,
      profileUid: "",
    }).ok,
    false,
  );
  const pendingCtx = author.buildProfileAnonViewerContext({
    chatId,
    chatAnonSessionId: threadA,
    currentUid: "",
    targetUid: "",
    chatOwnerUid: "",
    viewerUsername: "",
    authReady: false,
    identityReady: pendingReady,
  });
  const pendingMapped = author.remapProfileAnonMessagesMine(cached, pendingCtx);
  assert.deepEqual(
    pendingMapped.map((row) => row.mine),
    [true, false],
    "auth pending must hold cached sides, not classify as visitor",
  );

  const ownerUidReady = gates.isRoleIdentityReady({
    liveProfileUid: ownerUid,
    chatId,
    profileUid: "",
    viewerUsername: "",
    threadAnonId: threadA,
    authReady: true,
  });
  assert.equal(ownerUidReady, false, "owner UID without metadata is not role-ready");
  assert.equal(
    gates.buildCanonicalSender({
      authReady: true,
      liveProfileUid: ownerUid,
      threadAnonId: threadA,
      chatId,
      profileUid: "",
      viewerUsername: "",
    }).ok,
    false,
    "writer stays disabled until role resolves",
  );
  const uidCtx = author.buildProfileAnonViewerContext({
    chatId,
    chatAnonSessionId: threadA,
    currentUid: ownerUid,
    targetUid: "",
    chatOwnerUid: "",
    viewerUsername: "",
    authReady: true,
    identityReady: ownerUidReady,
  });
  const uidMapped = author.remapProfileAnonMessagesMine(pendingMapped, uidCtx);
  assert.deepEqual(uidMapped.map((row) => row.mine), [true, false]);

  const metaReady = gates.isRoleIdentityReady({
    liveProfileUid: ownerUid,
    chatId,
    profileUid: ownerUid,
    viewerUsername: "maria",
    threadAnonId: threadA,
    authReady: true,
    explicitOwner: true,
  });
  assert.equal(metaReady, true);
  const metaCtx = author.buildProfileAnonViewerContext({
    chatId,
    chatAnonSessionId: threadA,
    currentUid: ownerUid,
    targetUid: ownerUid,
    chatOwnerUid: ownerUid,
    viewerUsername: "maria",
    authReady: true,
    identityReady: metaReady,
  });
  const snapshot = author.mapFirestoreDocsToProfileAnonMessages(
    [
      {
        id: "s1",
        data: {
          texto: "yo",
          fromUid: `profile_${ownerUid}`,
          senderRole: "profile",
          senderAuthUid: ownerUid,
          senderKind: "profile",
        },
      },
      {
        id: "s2",
        data: {
          texto: "hola",
          fromUid: threadA,
          senderRole: "anon",
          senderKind: "anon",
        },
      },
    ],
    metaCtx,
  );
  const remapped = author.remapProfileAnonMessagesMine(
    uidMapped.map((row, index) => ({ ...row, fromUid: cached[index].fromUid })),
    metaCtx,
  );
  assert.deepEqual(remapped.map((row) => row.mine), [true, false]);
  assert.deepEqual(snapshot.map((row) => row.mine), [true, false]);
  assert.notDeepEqual(
    pendingMapped.map((row) => row.mine),
    [false, true],
  );
}

// cache → server / clientId identity for text + media
{
  const viewerCtx = {
    chatId,
    chatAnonSessionId: threadA,
    currentUid: "",
    targetUid: ownerUid,
    chatOwnerUid: ownerUid,
    profileUid: ownerUid,
    threadAnonId: threadA,
    liveAnonId: liveB,
    isOwnerViewing: false,
    identityReady: true,
  };
  const text = author.mapFirestoreDocsToProfileAnonMessages(
    [
      {
        id: "server_1",
        data: {
          texto: "hola",
          fromUid: liveB,
          senderRole: "anon",
          senderAuthUid: "visitor_1",
          senderKind: "anon",
          clientId: "cid_text",
          type: "text",
        },
      },
    ],
    viewerCtx,
  );
  assert.equal(text[0].clientId, "cid_text");
  assert.equal(text[0].mine, true);
  assert.equal(text[0].text, "hola");

  const media = author.mapFirestoreDocsToProfileAnonMessages(
    [
      {
        id: "server_2",
        data: {
          fromUid: liveB,
          senderRole: "anon",
          senderKind: "anon",
          clientId: "cid_media",
          type: "image",
          mediaUrl: "https://example.com/a.jpg",
        },
      },
    ],
    viewerCtx,
  );
  assert.equal(media[0].type, "image");
  assert.equal(media[0].clientId, "cid_media");
  assert.equal(media[0].mine, true);
}

// story reply A → rotate B → same username uses B
{
  const keyA = cacheKey.profileChatCacheKey({
    username: "maria",
    authUid: "",
    anonSessionId: threadA,
  });
  const keyB = cacheKey.profileChatCacheKey({
    username: "maria",
    authUid: "",
    anonSessionId: liveB,
  });
  const keyAccount = cacheKey.profileChatCacheKey({
    username: "maria",
    authUid: "acct_b",
    anonSessionId: liveB,
  });
  assert.notEqual(keyA, keyB);
  assert.notEqual(keyB, keyAccount);
  const chatA = chatIdMod.buildProfileAnonChatId(threadA, "maria");
  const chatB = chatIdMod.buildProfileAnonChatId(liveB, "maria");
  assert.notEqual(chatA, chatB);
  assert.match(chatB, /anon_bbbb/);
}

// offline retry keeps live fromUid
{
  const offline = gates.buildCanonicalSender({
    authReady: true,
    liveProfileUid: "",
    threadAnonId: threadA,
    liveAnonId: liveB,
    chatId,
    profileUid: ownerUid,
  });
  assert.equal(offline.sender.fromUid, liveB);
  assert.equal(
    persistAndReopen(offline.sender, threadA, liveB, {
      profileUid: ownerUid,
      isOwnerViewing: false,
      ownerUid: "",
    }),
    true,
  );
}

// legacy profile-profile
{
  const legacy = gates.buildLegacyCanonicalSender({
    authReady: true,
    liveProfileUid: "peer_a",
  });
  assert.equal(legacy.ok, true);
  assert.equal(
    gates.resolveMineFromCanonicalSender({
      senderAuthUid: legacy.sender.senderAuthUid,
      senderRole: legacy.sender.senderRole,
      fromUid: legacy.sender.fromUid,
      viewerUid: "peer_a",
      isOwnerViewing: true,
      threadAnonId: "",
      identityReady: true,
    }),
    true,
  );
}

const incoming = await import(
  pathToFileURL(path.join(root, "src/lib/chat/incomingChatActivity.ts")).href
);
const pending = await import(
  pathToFileURL(path.join(root, "src/lib/chat/threadPending.ts")).href
);

{
  const liveC = "anon_cccc";
  continuity.resetThreadAnonContinuityForTests();
  assert.deepEqual(
    continuity.rememberThreadAnonId(chatId, liveB, { ownerUncertain: true, provenOwn: true }),
    [],
  );
  continuity.rememberOwnThreadAnonId(chatId, threadA, {});
  continuity.rememberOwnThreadAnonId(chatId, liveB, {});
  const chat = {
    id: chatId,
    canonicalChatId: chatId,
    lastMessage: "desde B",
    lastMessageSender: liveB,
    latestMessageId: "m_b",
    latestSenderKind: "anon",
    latestSenderAnonSessionId: liveB,
    unreadCounts: {},
    readBy: {},
  };
  assert.equal(
    incoming.isOwnChatSender(liveB, liveC, "", chat),
    true,
    "B stays own in inbox after rotate to C",
  );
  assert.equal(incoming.isIncomingChatActivity(chat, liveC, ""), false);
  assert.equal(incoming.isOwnInboxLastSender(chat, liveC, ""), true);
  const threadState = pending.computeThreadPendingForViewer(chat, "", "");
  assert.equal(threadState.isOwnLatestMessage, true);
  assert.equal(threadState.computedPending, false);

  continuity.rememberOwnThreadAnonId(chatId, threadA, {});
  continuity.rememberOwnThreadAnonId(chatId, "anon_cccc", {});
  const ownerChat = {
    id: chatId,
    canonicalChatId: chatId,
    targetUid: ownerUid,
    receptorUid: ownerUid,
    lastMessage: "desde A",
    lastMessageSender: threadA,
    latestMessageId: "m_a_in",
    latestSenderKind: "anon",
    latestSenderAnonSessionId: threadA,
    unreadCounts: { [ownerUid]: 1 },
    readBy: { [ownerUid]: false },
  };
  const ownerRole = incoming.resolveChatViewerRole({
    viewerId: ownerUid,
    firebaseUid: ownerUid,
    chat: ownerChat,
    viewerKind: "owner",
    provenOwner: true,
  });
  assert.equal(ownerRole.provenOwner, true);
  assert.equal(
    incoming.isOwnChatSender(threadA, ownerUid, ownerUid, ownerChat, ownerRole),
    false,
    "owner must not own visitor continuity A",
  );
  assert.equal(
    incoming.isIncomingChatActivity(ownerChat, ownerUid, ownerUid, ownerRole),
    true,
  );
  const ownerPending = pending.computeThreadPendingForViewer(
    ownerChat,
    ownerUid,
    "",
    ownerRole,
  );
  assert.equal(ownerPending.isOwnLatestMessage, false);
  assert.equal(ownerPending.computedPending, true);

  const accountA = { authUid: "acct_a", provenOwn: true };
  const accountB = { authUid: "acct_b", provenOwn: true };
  continuity.resetThreadAnonContinuityForTests();
  continuity.rememberOwnThreadAnonId(chatId, liveB, accountA);
  assert.equal(continuity.listThreadAnonIds(chatId, [], accountA).includes(liveB), true);
  continuity.clearThreadAnonContinuity(accountA);
  assert.equal(
    continuity.listThreadAnonIds(chatId, [], accountB).includes(liveB),
    false,
    "logout A must not leak B into account B",
  );
  assert.deepEqual(
    continuity.rememberThreadAnonId(chatId, liveB, {
      authUid: "acct_b",
      ownerUncertain: true,
      provenOwn: true,
    }),
    [],
    "owner-uncertain must not register continuity",
  );
}

continuity.resetThreadAnonContinuityForTests?.();

const resolveSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/resolveProfileChat.ts"),
  "utf8",
);
assert.match(resolveSrc, /currentProfileChatCacheKey|profileChatCacheKey/);
assert.match(resolveSrc, /invalidateProfileChatCache/);
assert.match(
  fs.readFileSync(path.join(root, "src/lib/chat/anonSession.ts"), "utf8"),
  /invalidateProfileChatCache/,
);

console.log("pass authorship_lifecycle mine_stable=true ui_listener=true story_reply_key=true");
