/**
 * CHAT_SELF_SEND_UNREAD_BOLD — own send must not bold; late snapshots must not
 * re-bold after read; remote replies still bold (profile↔anon both ways).
 *   node --experimental-strip-types scripts/chat-self-send-unread-bold.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const pending = await import(
  pathToFileURL(path.join(root, "src/lib/chat/threadPending.ts")).href
);
const activity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/incomingChatActivity.ts")).href
);
const local = await import(
  pathToFileURL(path.join(root, "src/lib/chat/localChatRead.ts")).href
);
const meta = await import(
  pathToFileURL(path.join(root, "src/lib/chat/outgoingChatMeta.ts")).href
);
const continuity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/threadAnonContinuity.ts")).href
);

continuity.resetThreadAnonContinuityForTests();
globalThis.localStorage.clear();

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const ownerUid = "owneruid";
const visitorAnon = "anon_visitor";
const profileAuthor = `profile_${ownerUid}`;

function baseChat(overrides = {}) {
  return {
    id: `${visitorAnon}__anon_to__maria`,
    canonicalChatId: `${visitorAnon}__anon_to__maria`,
    lastMessage: "hola",
    lastMessageSender: visitorAnon,
    latestSenderKind: "anon",
    latestSenderAnonSessionId: visitorAnon,
    latestMessageId: "m1",
    lastMessageAt: { toMillis: () => 200_000 },
    anonSessionId: visitorAnon,
    targetUid: ownerUid,
    receptorUid: ownerUid,
    participantes: [visitorAnon, ownerUid],
    unreadCounts: {},
    readBy: {},
    ...overrides,
  };
}

// --- Outgoing meta never dirties sender identity aliases ---
{
  const recipients = meta.resolveChatRecipientIds(profileAuthor, {
    participantes: [visitorAnon, ownerUid],
    targetUid: ownerUid,
    receptorUid: ownerUid,
  });
  check(
    "RESOLVE_RECIPIENTS_EXCLUDES_PROFILE_OWNER_ALIASES",
    !recipients.includes(ownerUid) &&
      !recipients.includes(profileAuthor) &&
      recipients.includes(visitorAnon),
    { recipients },
  );

  const patch = meta.buildOutgoingChatMetaPatch(
    profileAuthor,
    [ownerUid, visitorAnon],
    {
      lastMessage: "reply",
      lastMessageSender: profileAuthor,
      latestMessageId: "m2",
      latestSenderKind: "profile",
    },
    { receiptSenderId: ownerUid },
  );
  check(
    "OUTGOING_ZEROS_SENDER_UNREAD_KEYS",
    patch[`unreadCounts.${ownerUid}`] === 0 &&
      patch[`unreadCounts.${profileAuthor}`] === 0 &&
      patch[`readBy.${ownerUid}`] === true &&
      patch[`readBy.${profileAuthor}`] === true,
  );
  check(
    "OUTGOING_STILL_DIRTIES_TRUE_RECIPIENT",
    patch[`readBy.${visitorAnon}`] === false &&
      patch[`unreadCounts.${visitorAnon}`] != null &&
      patch[`unreadCounts.${visitorAnon}`] !== 0,
  );
}

// --- Own anon send with Firebase uid fallback viewer must not bold ---
{
  continuity.resetThreadAnonContinuityForTests();
  continuity.rememberOwnThreadAnonId(
    `${visitorAnon}__anon_to__maria`,
    visitorAnon,
    {
      authUid: "firebase_visitor_uid",
      rootAnonSessionId: continuity.rootAnonContinuityId(),
    },
  );
  const chat = baseChat({
    unreadCounts: { [ownerUid]: 1, firebase_visitor_uid: 1 },
    readBy: { [visitorAnon]: true, firebase_visitor_uid: false },
  });
  const state = pending.computeThreadPendingForViewer(
    chat,
    "firebase_visitor_uid",
    "",
  );
  check(
    "OWN_ANON_SEND_NOT_BOLD_WITH_FIREBASE_UID_FALLBACK",
    state.computedPending === false && state.isOwnLatestMessage === true,
    { reason: state.reason, viewerId: state.viewerId },
  );
}

// --- Own profile reply with lagged empty lastMessageSender ---
{
  const chat = baseChat({
    lastMessage: "reply",
    lastMessageSender: "",
    latestSenderKind: "profile",
    latestSenderAnonSessionId: "",
    latestMessageId: "m2",
    unreadCounts: { [ownerUid]: 2, [profileAuthor]: 2 },
    readBy: { [ownerUid]: false },
  });
  check(
    "EMPTY_SENDER_OWNER_PROFILE_KIND_NOT_INCOMING",
    activity.isIncomingChatActivity(chat, ownerUid, ownerUid) === false,
  );
  const state = pending.computeThreadPendingForViewer(chat, ownerUid, "");
  check(
    "OWN_PROFILE_SEND_EMPTY_SENDER_NOT_BOLD",
    state.computedPending === false,
    { reason: state.reason, own: state.isOwnLatestMessage },
  );
}

// --- Own send with sender present never bold even with dirty unread ---
{
  const chat = baseChat({
    lastMessage: "yo",
    lastMessageSender: profileAuthor,
    latestSenderKind: "profile",
    latestSenderAnonSessionId: "",
    latestMessageId: "m3",
    unreadCounts: { [ownerUid]: 5, [profileAuthor]: 5, [visitorAnon]: 1 },
    readBy: { [ownerUid]: false, [profileAuthor]: false },
  });
  const state = pending.computeThreadPendingForViewer(chat, ownerUid, "");
  check(
    "OWN_SEND_NOT_BOLD_DESPITE_DIRTY_UNREAD",
    state.computedPending === false && state.reason === "latest-own",
  );
}

// --- After read, late dirty snapshot must not re-bold own latest ---
{
  globalThis.localStorage.clear();
  const own = baseChat({
    lastMessage: "mio",
    lastMessageSender: profileAuthor,
    latestSenderKind: "profile",
    latestSenderAnonSessionId: "",
    latestMessageId: "m4",
    lastMessageAt: { toMillis: () => 400_000 },
    unreadCounts: { [ownerUid]: 0 },
    readBy: { [ownerUid]: true },
  });
  local.markChatReadLocally(own, ownerUid, ownerUid);
  const late = {
    ...own,
    lastMessageSender: "",
    latestSenderKind: "profile",
    unreadCounts: { [ownerUid]: 1, [profileAuthor]: 1 },
    readBy: { [ownerUid]: false, [profileAuthor]: false },
    lastMessageAt: { toMillis: () => 400_500 },
  };
  const state = pending.computeThreadPendingForViewer(late, ownerUid, "");
  check(
    "LATE_SNAPSHOT_AFTER_READ_NO_REBOLD_OWN",
    state.computedPending === false,
    { reason: state.reason, localRead: state.localRead },
  );
}

// --- Remote anon → owner still bolds ---
{
  globalThis.localStorage.clear();
  const chat = baseChat({
    lastMessage: "remoto",
    lastMessageSender: visitorAnon,
    latestSenderKind: "anon",
    latestSenderAnonSessionId: visitorAnon,
    latestMessageId: "m5",
    unreadCounts: { [ownerUid]: 1 },
    readBy: { [ownerUid]: false },
  });
  const state = pending.computeThreadPendingForViewer(chat, ownerUid, "");
  check(
    "REMOTE_ANON_TO_OWNER_BOLD",
    state.computedPending === true && state.isOwnLatestMessage === false,
    { reason: state.reason },
  );
}

// --- Remote profile → anon visitor still bolds ---
{
  globalThis.localStorage.clear();
  continuity.resetThreadAnonContinuityForTests();
  continuity.rememberOwnThreadAnonId(
    `${visitorAnon}__anon_to__maria`,
    visitorAnon,
    {
      authUid: "",
      rootAnonSessionId: continuity.rootAnonContinuityId(),
    },
  );
  const chat = baseChat({
    lastMessage: "respuesta",
    lastMessageSender: profileAuthor,
    latestSenderKind: "profile",
    latestSenderAnonSessionId: "",
    latestMessageId: "m6",
    unreadCounts: { [visitorAnon]: 1 },
    readBy: { [visitorAnon]: false },
  });
  const state = pending.computeThreadPendingForViewer(chat, "", "", {
    viewerKind: "anon",
  });
  check(
    "REMOTE_PROFILE_TO_ANON_BOLD",
    state.computedPending === true &&
      activity.isIncomingProfileReplyForAnonVisitor(
        profileAuthor,
        visitorAnon,
        "",
        chat,
        { viewerKind: "anon" },
      ),
    { reason: state.reason, viewerId: state.viewerId },
  );
}

// --- New remote after read re-bolds ---
{
  globalThis.localStorage.clear();
  const first = baseChat({
    lastMessage: "viejo",
    lastMessageSender: visitorAnon,
    latestMessageId: "m7a",
    unreadCounts: { [ownerUid]: 1 },
    readBy: { [ownerUid]: false },
  });
  local.markChatReadLocally(
    {
      ...first,
      unreadCounts: { [ownerUid]: 0 },
      readBy: { [ownerUid]: true },
    },
    ownerUid,
    ownerUid,
  );
  const newer = {
    ...first,
    lastMessage: "nuevo remoto",
    lastMessageSender: visitorAnon,
    latestMessageId: "m7b",
    lastMessageAt: { toMillis: () => 700_000 },
    unreadCounts: { [ownerUid]: 1 },
    readBy: { [ownerUid]: false },
  };
  const state = pending.computeThreadPendingForViewer(newer, ownerUid, "");
  check(
    "NEW_REMOTE_AFTER_READ_REBOLD",
    state.computedPending === true,
    { reason: state.reason },
  );
}

// --- Continuity identity: remembered thread anon stays own across live rotate ---
{
  continuity.resetThreadAnonContinuityForTests();
  const chatId = `${visitorAnon}__anon_to__maria`;
  continuity.rememberOwnThreadAnonId(chatId, visitorAnon, {
    authUid: "firebase_visitor_uid",
    rootAnonSessionId: continuity.rootAnonContinuityId(),
  });
  const chat = baseChat({
    lastMessage: "continúo",
    lastMessageSender: visitorAnon,
    latestMessageId: "m8",
  });
  check(
    "CONTINUITY_OWN_SENDER_TRUE",
    activity.isOwnChatSender(
      visitorAnon,
      "firebase_visitor_uid",
      "firebase_visitor_uid",
      chat,
    ) === true ||
      pending.computeThreadPendingForViewer(chat, "firebase_visitor_uid", "")
        .isOwnLatestMessage === true,
  );
}

// Static wiring
{
  const outgoingSrc = fs.readFileSync(
    path.join(root, "src/lib/chat/outgoingChatMeta.ts"),
    "utf8",
  );
  const activitySrc = fs.readFileSync(
    path.join(root, "src/lib/chat/incomingChatActivity.ts"),
    "utf8",
  );
  check(
    "OUTGOING_SKIP_SENDER_KEYS_IN_RECIPIENT_LOOP",
    outgoingSrc.includes("senderKeys.has(readByKey)") &&
      outgoingSrc.includes("unreadCounts.${key}`] = 0"),
  );
  check(
    "EMPTY_SENDER_USES_KIND_SESSION_BEFORE_FAIL_OPEN",
    activitySrc.includes("latestSenderAnonSessionId") &&
      activitySrc.includes('kind === "profile"') &&
      activitySrc.includes("prefer stable kind/session attribution"),
  );
}

const failed = checks.filter((c) => !c.pass);
const report = {
  gate: "CHAT_SELF_SEND_UNREAD_BOLD",
  pass: failed.length === 0,
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exit(1);
console.log("PASS chat-self-send-unread-bold");
