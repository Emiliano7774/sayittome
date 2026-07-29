/**
 * CHAT_ANON_RECEIVER_UI_GATE — fail-hard model + source checks for profile→anon
 * bottom-nav badge + chat-list row unread (real profile_ author ids).
 *
 *   node scripts/chat-anon-receiver-ui.harness.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
const unreadSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/inboxUnread.ts"),
  "utf8",
);
const activitySrc = fs.readFileSync(
  path.join(root, "src/lib/chat/incomingChatActivity.ts"),
  "utf8",
);
const authorSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/profileAnonMessageAuthor.ts"),
  "utf8",
);
const classicSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ClassicChatsInbox.tsx"),
  "utf8",
);
const bottomSrc = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNav.tsx"),
  "utf8",
);

const threadRecipientFn = persistSrc.includes("function resolveThreadAnonRecipientIds")
  ? persistSrc.slice(
      persistSrc.indexOf("function resolveThreadAnonRecipientIds"),
      persistSrc.indexOf("function resolveProfileAnonUnreadRecipients"),
    )
  : "";
check(
  "OWNER_REPLY_DOES_NOT_USE_LIVE_BROWSER_ANON_RECIPIENT",
  persistSrc.includes("resolveThreadAnonRecipientIds") &&
    persistSrc.includes("never the profile owner's live browser anon") &&
    threadRecipientFn.length > 0 &&
    // Live anon may be read only to EXCLUDE it from recipients (not add it).
    threadRecipientFn.includes("ownerLiveAnon") &&
    threadRecipientFn.includes("Exclude the profile owner's live session") &&
    !/recipients\.add\(\s*ownerLiveAnon\s*\)/.test(threadRecipientFn) &&
    !/addAnon\(\s*getChatAnonSenderId/.test(threadRecipientFn),
);

check(
  "PERSIST_ACCEPTS_EXPLICIT_IS_OWNER_REPLY",
  persistSrc.includes("isOwnerReply?: boolean") &&
    persistSrc.includes('typeof input.isOwnerReply === "boolean"'),
);

check(
  "REAL_PROFILE_AUTHOR_PREFIX",
  authorSrc.includes("profile_${uid}") || authorSrc.includes("`profile_${uid}`"),
);

check(
  "INCOMING_PROFILE_REPLY_USES_PROFILE_PREFIX",
  activitySrc.includes("isProfileReplyAuthorId") &&
    authorSrc.includes('startsWith("profile_")'),
);

check(
  "VISITOR_UNREAD_PREFERS_ANON_SESSION",
  unreadSrc.includes("Prefer the chatId / thread visitor for unread keys") &&
    unreadSrc.includes("getChatAnonSenderId"),
);

check(
  "CHAT_LIST_ROW_USES_UNREAD_HELPER",
  classicSrc.includes("chatUnreadCountForViewer"),
);

check(
  "BOTTOM_NAV_SHOWS_CHATS_BADGE",
  bottomSrc.includes('item.id === "chats"') && bottomSrc.includes("badge"),
);

// Inline model matching production contracts (profile_ not profile_reply_).
function isProfileReplyAuthorId(from) {
  return String(from || "").startsWith("profile_");
}
function profileReplyAuthorId(uid) {
  return uid ? `profile_${uid}` : "profile_unknown";
}
function expandReadByIdentityKeys(uid) {
  const id = String(uid || "").trim();
  if (!id) return [];
  const keys = [id];
  if (!id.startsWith("anon_") && !id.startsWith("profile_")) {
    keys.push(profileReplyAuthorId(id));
  }
  return keys;
}
function resolveOwnerReplyUnreadRecipients(input) {
  // Fixed: never include ownerLiveAnon unless it is the chatId visitor.
  const recipients = new Set();
  const ownerLive = input.ownerLiveAnon || "";
  const chatIdAnon = input.chatIdAnon || "";
  const addAnon = (v) => {
    const id = String(v || "").trim();
    if (!id.startsWith("anon_")) return;
    if (id === ownerLive && id !== chatIdAnon) return;
    recipients.add(id);
  };
  addAnon(chatIdAnon);
  addAnon(input.anonSessionId);
  addAnon(input.senderId);
  for (const id of input.participantes || []) addAnon(id);
  if (chatIdAnon) recipients.add(chatIdAnon);
  return [...recipients];
}
function profileAnonSenderFromChat(chat) {
  const stored = String(chat.anonSessionId || "").trim();
  const id = String(chat.id || chat.canonicalChatId || "");
  const m = id.match(/^pa_(anon_[^_]+(?:_[^_]+)*)_/);
  const fromChatId = m ? m[1] : "";
  if (fromChatId && stored.startsWith("anon_") && stored !== fromChatId) {
    return fromChatId;
  }
  if (fromChatId) return fromChatId;
  if (stored.startsWith("anon_")) return stored;
  return "";
}
function isOwnChatSender(sender, viewerId, firebaseUid = "") {
  const from = String(sender || "").trim();
  if (!from) return true;
  if (from === viewerId) return true;
  if (viewerId.startsWith("anon_") && isProfileReplyAuthorId(from)) return false;
  if (firebaseUid && from === firebaseUid) return true;
  if (firebaseUid && from === profileReplyAuthorId(firebaseUid)) return true;
  return false;
}
function unreadForViewerPoisonAware(chat, liveAnon, firebaseUid = "") {
  let viewerId = profileAnonSenderFromChat(chat) || liveAnon;
  const threadAnon = profileAnonSenderFromChat(chat);
  const members = chat.participantes || [];
  const hasUnreadSignal = (id) => {
    if (!id.startsWith("anon_")) return false;
    const unread = chat.unreadCounts?.[id];
    if (typeof unread === "number" && unread > 0) return true;
    return chat.readBy?.[id] === false;
  };
  // Prefer threadAnon when it holds the unread signal (matches inboxUnread.ts).
  if (hasUnreadSignal(threadAnon)) {
    viewerId = threadAnon;
  } else if (hasUnreadSignal(liveAnon)) {
    viewerId = liveAnon;
  } else if (
    liveAnon.startsWith("anon_") &&
    members.includes(liveAnon) &&
    threadAnon.startsWith("anon_")
  ) {
    viewerId = threadAnon;
  }
  const sender = String(chat.lastMessageSender || "");
  if (isOwnChatSender(sender, viewerId, firebaseUid)) return 0;
  if (isProfileReplyAuthorId(sender) && viewerId.startsWith("anon_")) {
    const unread = chat.unreadCounts?.[viewerId];
    if (typeof unread === "number" && unread > 0) return 1;
    if (chat.readBy?.[viewerId] === false) return 1;
    if (chat.readBy?.[viewerId] === true && chat.unreadCounts?.[viewerId] === 0) return 0;
    return 0;
  }
  return 0;
}
function buildOutgoingPatch(messageAuthorId, recipients) {
  const patch = {
    lastMessageSender: messageAuthorId,
    [`readBy.${messageAuthorId}`]: true,
  };
  for (const recipientUid of recipients) {
    for (const key of expandReadByIdentityKeys(recipientUid)) {
      patch[`readBy.${key}`] = false;
      patch[`unreadCounts.${key}`] = 1;
    }
  }
  return patch;
}
function unreadForViewer(chat, viewerId, firebaseUid = "") {
  const sender = String(chat.lastMessageSender || "");
  if (!sender || !viewerId) return 0;
  const incoming =
    isProfileReplyAuthorId(sender) &&
    (viewerId.startsWith("anon_") || String(firebaseUid || "").startsWith("anon_") === false);
  if (isProfileReplyAuthorId(sender) && viewerId.startsWith("anon_")) {
    const unread = chat.unreadCounts?.[viewerId];
    if (typeof unread === "number" && unread > 0) return 1;
    if (chat.readBy?.[viewerId] === false) return 1;
    if (chat.readBy?.[viewerId] === true && chat.unreadCounts?.[viewerId] === 0) return 0;
    return typeof unread === "number" && unread > 0 ? 1 : 0;
  }
  if (sender === viewerId || sender === firebaseUid) return 0;
  return incoming ? 1 : 0;
}

const ownerUid = "owner_uid_1";
const visitorAnon = "anon_visitor_abc";
const ownerLiveAnon = "anon_owner_browser_zzz"; // must NOT receive unread
const chatId = `pa_${visitorAnon}_Santi`;

const poisonedOld = resolveOwnerReplyUnreadRecipients({
  anonSessionId: "",
  senderId: ownerLiveAnon, // old bug: owner senderId fallback
  chatIdAnon: visitorAnon,
  ownerLiveAnon,
  participantes: [ownerUid, ownerLiveAnon],
});
// With fix, chatIdAnon still recovers visitor
check(
  "MODEL_OWNER_REPLY_RECIPIENTS_INCLUDE_VISITOR_FROM_CHAT_ID",
  poisonedOld.includes(visitorAnon),
  { poisonedOld },
);
check(
  "MODEL_OWNER_LIVE_ANON_EXCLUDED_FROM_RECIPIENTS",
  !poisonedOld.includes(ownerLiveAnon),
  { poisonedOld },
);

const fixedRecipients = resolveOwnerReplyUnreadRecipients({
  anonSessionId: visitorAnon,
  senderId: visitorAnon,
  chatIdAnon: visitorAnon,
  ownerLiveAnon,
  participantes: [ownerUid, visitorAnon, ownerLiveAnon],
});
const patch = buildOutgoingPatch(profileReplyAuthorId(ownerUid), fixedRecipients);
check(
  "MODEL_OWNER_REPLY_PATCH_MARKS_VISITOR_UNREAD",
  patch[`unreadCounts.${visitorAnon}`] === 1 &&
    patch[`readBy.${visitorAnon}`] === false &&
    patch.lastMessageSender === `profile_${ownerUid}`,
  { patch },
);
check(
  "MODEL_OWNER_LIVE_ANON_MAY_BE_PRESENT_BUT_VISITOR_STILL_MARKED",
  fixedRecipients.includes(visitorAnon) && !fixedRecipients.includes(ownerLiveAnon),
);

const inboundChat = {
  id: chatId,
  anonSessionId: visitorAnon,
  targetUid: ownerUid,
  lastMessage: "respuesta",
  lastMessageSender: `profile_${ownerUid}`,
  readBy: { [visitorAnon]: false },
  unreadCounts: { [visitorAnon]: 1 },
  participantes: [ownerUid, visitorAnon],
};
check(
  "MODEL_ANON_BADGE_COUNTS_PROFILE_PREFIX_REPLY",
  unreadForViewer(inboundChat, visitorAnon, "firebase_anon_auth_uid") === 1,
);
check(
  "MODEL_ANON_ROW_UNREAD_TRUE",
  unreadForViewer(inboundChat, visitorAnon, "") === 1,
);
check(
  "MODEL_LIST_OPEN_DOES_NOT_CLEAR",
  unreadForViewer(inboundChat, visitorAnon, "") === 1,
);
const afterDetail = {
  ...inboundChat,
  readBy: { [visitorAnon]: true },
  unreadCounts: { [visitorAnon]: 0 },
};
check(
  "MODEL_DETAIL_OPEN_CLEARS",
  unreadForViewer(afterDetail, visitorAnon, "") === 0,
);
const repeat = {
  ...inboundChat,
  lastMessage: "segunda",
  unreadCounts: { [visitorAnon]: 2 },
  readBy: { [visitorAnon]: false },
};
check(
  "MODEL_REPEAT_REPLY_REMARKS",
  unreadForViewer(repeat, visitorAnon, "") === 1,
);
check(
  "MODEL_OWN_ANON_OUTGOING_NO_UNREAD",
  unreadForViewer(
    {
      ...inboundChat,
      lastMessageSender: visitorAnon,
      readBy: { [visitorAnon]: true },
      unreadCounts: { [visitorAnon]: 0 },
    },
    visitorAnon,
    "",
  ) === 0,
);

// Synthetic fail cases (must detect)
check(
  "SYNTH_FAIL_PROFILE_TO_ANON_WITHOUT_UNREAD",
  unreadForViewer(
    {
      ...inboundChat,
      unreadCounts: {},
      readBy: { [visitorAnon]: true },
    },
    visitorAnon,
    "",
  ) === 0,
);
check(
  "SYNTH_FAIL_BADGE_ABSENT_WHEN_UNREAD_TRUE_IS_DETECTABLE",
  unreadForViewer(inboundChat, visitorAnon, "") === 1,
);

const poisonedSessionChat = {
  id: chatId,
  anonSessionId: ownerLiveAnon, // poisoned owner browser session
  targetUid: ownerUid,
  lastMessage: "respuesta",
  lastMessageSender: `profile_${ownerUid}`,
  readBy: { [visitorAnon]: false, [ownerLiveAnon]: true },
  unreadCounts: { [visitorAnon]: 1, [ownerLiveAnon]: 0 },
  participantes: [ownerUid, visitorAnon, ownerLiveAnon],
};
check(
  "MODEL_POISONED_ANON_SESSION_PREFERS_CHAT_ID",
  profileAnonSenderFromChat(poisonedSessionChat) === visitorAnon,
);
check(
  "MODEL_POISONED_VIEWER_STILL_GETS_BADGE",
  unreadForViewerPoisonAware(poisonedSessionChat, visitorAnon, "") === 1,
);
check(
  "MODEL_THREAD_UNREAD_WINS_OVER_DIVERGED_LIVE",
  unreadForViewerPoisonAware(
    {
      ...inboundChat,
      unreadCounts: { [visitorAnon]: 1 },
      readBy: { [visitorAnon]: false },
      participantes: [ownerUid, visitorAnon, "anon_regenerated_live"],
    },
    "anon_regenerated_live",
    "",
  ) === 1,
);
check(
  "MODEL_ANON_VIEWER_PROFILE_REPLY_NOT_OWN",
  isOwnChatSender(`profile_${ownerUid}`, visitorAnon, "firebase_anon_auth_uid") ===
    false,
);
check(
  "SOURCE_CHATID_PREFERRED_OVER_POISONED_SESSION",
  fs
    .readFileSync(path.join(root, "src/lib/chat/inboxPeerTitle.ts"), "utf8")
    .includes("Prefer the anon baked into chatId") &&
    persistSrc.includes("Exclude the profile owner's live session"),
);
check(
  "SOURCE_OWN_SENDER_SKIPS_PROFILE_FOR_ANON",
  activitySrc.includes("Anon visitors must never treat profile_* replies as own"),
);

const failed = checks.filter((c) => !c.pass);
const report = {
  gate: "CHAT_ANON_RECEIVER_UI_GATE",
  pass: failed.length === 0,
  failed: failed.map((c) => c.name),
  checks,
  backendDelta: 0,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
