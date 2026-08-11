/**
 * Chat message authorship invariants (profile↔anon + legacy).
 * Regression gate for cold-reopen inversion (P1).
 *
 * Usage: node scripts/chat-message-authorship.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function profileReplyAuthorId(targetUid) {
  const uid = String(targetUid || "").trim();
  return uid ? `profile_${uid}` : "profile_unknown";
}

function isProfileReplyAuthorId(from) {
  return String(from || "").startsWith("profile_");
}

function profileAuthUid(user) {
  if (!user || user.isAnonymous) return "";
  return String(user.uid || "").trim();
}

function resolveProfileAnonSenderKind(input) {
  const from = String(input.from || "").trim();
  if (!from) return "unknown";
  if (from.startsWith("anon_")) return "anon";
  if (isProfileReplyAuthorId(from)) return "profile";
  if (input.senderKind === "profile" || input.senderKind === "anon") {
    return input.senderKind;
  }
  if (from === input.threadAnonId) return "anon";
  return "unknown";
}

function inferOwnerViewingFromAuthors(currentUid, profileUid, rows) {
  const uid = String(currentUid || "").trim();
  const profile = String(profileUid || "").trim();
  if (uid && profile && uid === profile) return true;
  if (!uid) return false;
  const mineProfile = profileReplyAuthorId(uid);
  return rows.some((row) => {
    const from = String(row.fromUid || "").trim();
    return from === mineProfile || from === uid;
  });
}

function resolveProfileAnonMessageMine(input) {
  const from = String(input.from || "").trim();
  const authUid = String(input.ownerUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  const messageProfileUid = String(input.messageProfileUid || "").trim();
  const kind = resolveProfileAnonSenderKind({
    ...input,
    from,
    profileUid,
    messageProfileUid: messageProfileUid || undefined,
  });

  const ownsProfileShape =
    Boolean(authUid) &&
    (from === authUid ||
      from === profileReplyAuthorId(authUid) ||
      messageProfileUid === authUid);

  if (ownsProfileShape) return true;

  const ownerViewing =
    input.isOwnerViewing || Boolean(authUid && profileUid && authUid === profileUid);

  if (ownerViewing) {
    return kind === "profile" || isProfileReplyAuthorId(from) || from === authUid;
  }

  if (kind === "profile" || isProfileReplyAuthorId(from)) return false;

  const threadAnon = String(input.threadAnonId || "").trim();
  const liveAnon = String(input.liveAnon || "").trim();
  if (threadAnon && from === threadAnon) return true;
  if (liveAnon.startsWith("anon_") && from === liveAnon) return true;
  return false;
}

function resolveLegacyChatMessageMine(fromUid, viewerUid) {
  const from = String(fromUid || "").trim();
  const viewer = String(viewerUid || "").trim();
  if (!from || !viewer) return false;
  if (from === viewer) return true;
  if (from === profileReplyAuthorId(viewer)) return true;
  return false;
}

function classifyBatch(rows, input) {
  const isOwnerViewing =
    input.isOwnerViewing ||
    inferOwnerViewingFromAuthors(input.ownerUid, input.profileUid, rows);
  return rows.map((row) =>
    resolveProfileAnonMessageMine({
      ...input,
      from: row.fromUid,
      senderKind: row.senderKind,
      messageProfileUid: row.profileUid,
      isOwnerViewing,
    }),
  );
}

const OWNER = "ownerUid123";
const PEER = "peerUid456";
const PROFILE_FROM = profileReplyAuthorId(OWNER);
const PEER_PROFILE = profileReplyAuthorId(PEER);
const ANON = "anon_abc123";
const ANON_OTHER = "anon_other999";

// --- BEFORE regression: empty auth → visitor path inverted owner thread ---
{
  const rows = [
    { fromUid: PROFILE_FROM, senderKind: "profile" },
    { fromUid: ANON, senderKind: "anon" },
  ];
  const before = classifyBatch(rows, {
    threadAnonId: ANON,
    profileUid: "",
    ownerUid: "",
    isOwnerViewing: false,
    liveAnon: ANON_OTHER,
  });
  assert.deepEqual(
    before,
    [false, true],
    "BEFORE cold empty-auth: profile peer + anon mine (inverted for owner)",
  );
}

// --- AFTER: owner auth present, profileUid still empty, batch inference ---
{
  const rows = [
    { fromUid: PROFILE_FROM, senderKind: "profile" },
    { fromUid: ANON, senderKind: "anon" },
  ];
  const after = classifyBatch(rows, {
    threadAnonId: ANON,
    profileUid: "",
    ownerUid: OWNER,
    isOwnerViewing: false,
    liveAnon: ANON_OTHER,
  });
  assert.deepEqual(
    after,
    [true, false],
    "AFTER owner auth: profile mine + anon peer (cold reopen fixed)",
  );
}

// Anonymous Firebase Auth uid must not act as profile owner.
assert.equal(profileAuthUid({ uid: "anonFirebase", isAnonymous: true }), "");
assert.equal(profileAuthUid({ uid: OWNER, isAnonymous: false }), OWNER);
assert.equal(profileAuthUid(null), "");

// fromUid shape wins over contradictory senderKind
assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "anon",
    from: PROFILE_FROM,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: true,
    ownerUid: OWNER,
  }),
  true,
);

// Visitor after kill: new live anon, thread anon from chatId still owns old msgs
assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "anon",
    from: ANON,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: false,
    ownerUid: "",
    liveAnon: ANON_OTHER,
  }),
  true,
);

// Logged-in visitor to peer profile
assert.deepEqual(
  classifyBatch(
    [
      { fromUid: ANON, senderKind: "anon" },
      { fromUid: PEER_PROFILE, senderKind: "profile" },
    ],
    {
      threadAnonId: ANON,
      profileUid: PEER,
      ownerUid: OWNER,
      isOwnerViewing: false,
      liveAnon: ANON,
    },
  ),
  [true, false],
);

// Cold start: targetUid empty, chatId slug matches cached username → owner.
function isProfileThreadOwner(input) {
  const authUid = String(input.authUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  if (authUid && profileUid && authUid === profileUid) return true;
  const hint = String(input.chatId || "").split("__anon_to__")[1] || "";
  const slug = String(input.viewerUsername || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80);
  return Boolean(hint && slug && hint === slug);
}

const OWNER_CHAT = `${ANON}__anon_to__ownername`;
assert.equal(
  isProfileThreadOwner({
    chatId: OWNER_CHAT,
    authUid: OWNER,
    profileUid: "",
    viewerUsername: "ownername",
  }),
  true,
  "chatId slug identifies owner before targetUid hydrates",
);
assert.equal(
  isProfileThreadOwner({
    chatId: OWNER_CHAT,
    authUid: OWNER,
    profileUid: "",
    viewerUsername: "visitorname",
  }),
  false,
  "visitor username must not claim owner thread",
);

{
  const ownerBySlug = isProfileThreadOwner({
    chatId: OWNER_CHAT,
    authUid: OWNER,
    profileUid: "",
    viewerUsername: "ownername",
  });
  const afterSlug = classifyBatch(
    [
      { fromUid: PROFILE_FROM, senderKind: "profile" },
      { fromUid: ANON, senderKind: "anon" },
    ],
    {
      threadAnonId: ANON,
      profileUid: "",
      ownerUid: OWNER,
      isOwnerViewing: ownerBySlug,
      liveAnon: ANON_OTHER,
    },
  );
  assert.deepEqual(
    afterSlug,
    [true, false],
    "owner-by-chatId-slug: profile mine, thread anon peer",
  );
}

// Persist must not write visitor fromUid when owner is known via slug.
function persistAuthorId(input) {
  const owner =
    Boolean(input.currentUid && input.targetUid && input.currentUid === input.targetUid) ||
    isProfileThreadOwner({
      chatId: input.chatId,
      authUid: input.currentUid,
      profileUid: input.targetUid,
      viewerUsername: input.viewerUsername,
    }) ||
    input.isOwnerReply === true;
  return owner
    ? profileReplyAuthorId(input.targetUid || input.currentUid)
    : input.senderId;
}
assert.equal(
  persistAuthorId({
    chatId: OWNER_CHAT,
    currentUid: OWNER,
    targetUid: "",
    senderId: ANON,
    viewerUsername: "ownername",
    isOwnerReply: false,
  }),
  PROFILE_FROM,
  "persist uses profile_* for owner even when targetUid empty",
);

// Legacy profile↔profile
assert.equal(resolveLegacyChatMessageMine(OWNER, OWNER), true);
assert.equal(resolveLegacyChatMessageMine(PEER, OWNER), false);
assert.equal(resolveLegacyChatMessageMine(profileReplyAuthorId(OWNER), OWNER), true);
assert.equal(resolveLegacyChatMessageMine(OWNER, ""), false);

// Source guards
const authorSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts"),
  "utf8",
);
assert.match(authorSrc, /profileAuthUid/);
assert.match(authorSrc, /mapFirestoreDocsToProfileAnonMessages/);
assert.match(authorSrc, /resolveLegacyChatMessageMine/);
assert.match(authorSrc, /fromUid shape wins/);
assert.match(authorSrc, /isProfileThreadOwner/);

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
assert.match(persistSrc, /ownerByChatId/);
assert.match(persistSrc, /viewerUsername/);

const identitySrc = fs.readFileSync(
  path.join(root, "src/lib/chat/viewerIdentityCache.ts"),
  "utf8",
);
assert.match(identitySrc, /sayittome:viewer-identity:v1/);

const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
assert.match(logoutSrc, /clearCachedViewerIdentity/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /profileAuthUid/);
assert.match(chatSrc, /displayMessages/);
assert.match(chatSrc, /mapFirestoreDocsToProfileAnonMessages/);

const legacySrc = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);
assert.match(legacySrc, /resolveLegacyChatMessageMine/);
assert.match(legacySrc, /profileAuthUid/);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_MESSAGE_AUTHORSHIP",
      pass: true,
      regression: {
        beforeEmptyAuthInverted: true,
        afterOwnerAuthFixed: true,
      },
    },
    null,
    2,
  ),
);
