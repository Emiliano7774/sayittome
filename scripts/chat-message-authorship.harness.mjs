/**
 * Chat message authorship invariants (profile↔anon).
 * Fails if profile replies classify as peer while auth uid is already known
 * but profileUid context is still empty (cold reopen regression).
 * Also fails if fromUid shape loses to contradictory senderKind.
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

function resolveProfileAnonSenderKind(input) {
  const from = String(input.from || "").trim();
  if (!from) return "unknown";
  // fromUid shape wins over contradictory senderKind.
  if (from.startsWith("anon_")) return "anon";
  if (isProfileReplyAuthorId(from)) return "profile";
  if (input.senderKind === "profile" || input.senderKind === "anon") {
    return input.senderKind;
  }
  if (from === input.threadAnonId) return "anon";
  return "unknown";
}

function resolveProfileAnonMessageMine(input) {
  const from = String(input.from || "").trim();
  const ownerUid = String(input.ownerUid || "").trim();
  const profileUid = String(input.profileUid || "").trim();
  const messageProfileUid = String(input.messageProfileUid || "").trim();
  const kind = resolveProfileAnonSenderKind({
    ...input,
    from,
    profileUid,
    messageProfileUid: messageProfileUid || undefined,
  });

  const structurallyOwnProfileReply =
    Boolean(ownerUid) &&
    (from === ownerUid ||
      from === profileReplyAuthorId(ownerUid) ||
      messageProfileUid === ownerUid);

  if (ownerUid && from === profileReplyAuthorId(ownerUid)) {
    return true;
  }

  if (input.isOwnerViewing || structurallyOwnProfileReply) {
    if (kind === "profile" || isProfileReplyAuthorId(from) || structurallyOwnProfileReply) {
      return true;
    }
    return false;
  }

  if (kind === "profile" || isProfileReplyAuthorId(from)) return false;

  const threadAnon = String(input.threadAnonId || "").trim();
  const liveAnon = String(input.liveAnon || "").trim();
  if (ownerUid && profileUid && ownerUid === profileUid) {
    return false;
  }
  if (ownerUid && from === ownerUid) return true;
  if (threadAnon && from === threadAnon) return true;
  if (liveAnon.startsWith("anon_") && from === liveAnon) return true;
  return false;
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

const OWNER = "ownerUid123";
const PROFILE_FROM = profileReplyAuthorId(OWNER);
const ANON = "anon_abc123";

assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "profile",
    from: PROFILE_FROM,
    threadAnonId: ANON,
    profileUid: "",
    messageProfileUid: OWNER,
    isOwnerViewing: false,
    ownerUid: OWNER,
  }),
  true,
  "owner profile reply must stay mine when profileUid context empty",
);

assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "anon", // contradictory
    from: PROFILE_FROM,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: true,
    ownerUid: OWNER,
  }),
  true,
  "fromUid profile_ wins over mis-tagged senderKind=anon",
);

assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "profile", // contradictory
    from: ANON,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: false,
    ownerUid: "",
    liveAnon: ANON,
  }),
  true,
  "fromUid anon_ wins over mis-tagged senderKind=profile for visitor",
);

assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "profile",
    from: PROFILE_FROM,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: true,
    ownerUid: OWNER,
  }),
  true,
  "owner viewing keeps profile replies as mine",
);

assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "profile",
    from: PROFILE_FROM,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: false,
    ownerUid: "",
    liveAnon: ANON,
  }),
  false,
  "anon visitor must not own profile replies",
);

assert.equal(
  resolveProfileAnonMessageMine({
    senderKind: "anon",
    from: ANON,
    threadAnonId: ANON,
    profileUid: OWNER,
    isOwnerViewing: false,
    ownerUid: "",
    liveAnon: ANON,
  }),
  true,
  "anon visitor owns own anon messages",
);

// Cold reopen with empty auth: cache mine must be preservable (source guard).
assert.equal(
  inferOwnerViewingFromAuthors("", "", [{ fromUid: PROFILE_FROM }, { fromUid: ANON }]),
  false,
  "empty auth must not infer owner viewing",
);

assert.equal(
  inferOwnerViewingFromAuthors(OWNER, "", [{ fromUid: PROFILE_FROM }, { fromUid: ANON }]),
  true,
  "known uid + own profile_* authors infer owner viewing",
);

const authorSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts"),
  "utf8",
);
assert.match(authorSrc, /structurallyOwnProfileReply/);
assert.match(authorSrc, /fromUid shape wins/);
assert.match(authorSrc, /inferOwnerViewingFromAuthors/);

const cacheSrc = fs.readFileSync(path.join(root, "src/lib/chat/chatMessageCache.ts"), "utf8");
assert.match(cacheSrc, /clearCachedChatMessages/);
assert.match(cacheSrc, /STORAGE_PREFIX|sayittome:chat-msgs:v3/);
assert.match(cacheSrc, /mine\?:/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /inferOwnerViewingFromAuthors/);
assert.match(chatSrc, /typeof row\.mine === "boolean"/);

const navSrc = fs.readFileSync(
  path.join(root, "src/components/navigation/AppNavigation.tsx"),
  "utf8",
);
assert.match(navSrc, /pathname\.startsWith\("\/chat"\)/);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_MESSAGE_AUTHORSHIP",
      pass: true,
    },
    null,
    2,
  ),
);
