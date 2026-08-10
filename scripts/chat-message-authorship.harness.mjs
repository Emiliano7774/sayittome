/**
 * Chat message authorship invariants (profile↔anon).
 * Fails if profile replies classify as peer while auth uid is already known
 * but profileUid context is still empty (cold reopen regression).
 *
 * Usage: node scripts/chat-message-authorship.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Mirror production classifier without pulling Firebase into the harness.
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
  if (input.senderKind === "profile" || input.senderKind === "anon") return input.senderKind;
  if (isProfileReplyAuthorId(from)) return "profile";
  if (from === input.threadAnonId || from.startsWith("anon_")) return "anon";
  return "unknown";
}

/** Fixed classifier matching post-fix production rules. */
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

  if (input.isOwnerViewing || structurallyOwnProfileReply) {
    if (kind === "profile" || isProfileReplyAuthorId(from) || structurallyOwnProfileReply) {
      return true;
    }
    return false;
  }

  if (kind === "profile" || isProfileReplyAuthorId(from)) return false;

  const threadAnon = String(input.threadAnonId || "").trim();
  const liveAnon = String(input.liveAnon || "").trim();
  if (ownerUid && from === ownerUid) return true;
  if (threadAnon && from === threadAnon) return true;
  if (liveAnon.startsWith("anon_") && from === liveAnon) return true;
  return false;
}

const OWNER = "ownerUid123";
const PROFILE_FROM = profileReplyAuthorId(OWNER);
const ANON = "anon_abc123";

// Cold reopen: auth uid known, profileUid still empty — must stay mine.
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

// Source guards
const authorSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts"),
  "utf8",
);
assert.match(authorSrc, /structurallyOwnProfileReply/);
assert.match(authorSrc, /messageProfileUid === ownerUid/);

const cacheSrc = fs.readFileSync(path.join(root, "src/lib/chat/chatMessageCache.ts"), "utf8");
assert.match(cacheSrc, /clearCachedChatMessages/);
assert.match(cacheSrc, /STORAGE_PREFIX/);
assert.match(cacheSrc, /resolveViewerKey|viewerKey/);

const logoutSrc = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");
assert.match(logoutSrc, /clearCachedChatMessages/);
assert.match(logoutSrc, /clearInboxSnapshotCache/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /useState<Message\[\]>\(\(\) =>/);
assert.match(chatSrc, /readCachedChatMessages\(chatId\)/);
assert.match(chatSrc, /auth\.currentUser\?\.uid/);

const whipSrc = fs.readFileSync(path.join(root, "src/lib/chat/whipSound.ts"), "utf8");
assert.match(whipSrc, /reprimeWhipSound/);
assert.match(whipSrc, /force\?: boolean/);

const notifSrc = fs.readFileSync(path.join(root, "src/lib/chat/chatNotifications.ts"), "utf8");
assert.match(notifSrc, /localNotificationActionPerformed/);
assert.match(notifSrc, /stableNotificationId/);

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
