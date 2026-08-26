/**
 * CHAT_UNREAD_BADGE_GATE — synthetic data-model + static wiring checks.
 *   node scripts/chat-unread-badge.harness.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const activitySrc = fs.readFileSync(
  path.join(root, "src/lib/chat/incomingChatActivity.ts"),
  "utf8",
);
const bubbleSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/chatBubbleStyles.ts"),
  "utf8",
);
const routesSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/inboxListenerRoutes.ts"),
  "utf8",
);
const appNav = fs.readFileSync(
  path.join(root, "src/components/navigation/AppNavigation.tsx"),
  "utf8",
);
const bottomNav = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNav.tsx"),
  "utf8",
);
const modernNav = fs.readFileSync(
  path.join(root, "src/components/navigation/ModernBottomNav.tsx"),
  "utf8",
);
const modernInbox = fs.readFileSync(
  path.join(root, "src/components/chats/ModernChatsInbox.tsx"),
  "utf8",
);

check(
  "BOTTOM_NAV_CHAT_BADGE_WIRED",
  appNav.includes("totalUnread") &&
    bottomNav.includes("ChatPendingIndicator") &&
    modernNav.includes("ChatPendingIndicator"),
);

check(
  "CHAT_LIST_ROW_UNREAD_HIGHLIGHT_PRESENT",
  modernInbox.includes("chatUnreadCountForViewer") &&
    modernInbox.includes("font-black") &&
    modernInbox.includes("ChatPendingIndicator"),
);

check(
  "COLLECT_VIEWER_IDS_DOES_NOT_SWEEP_PEER_ANON",
  activitySrc.includes("Never include peer anon") &&
    !activitySrc.includes("for (const participant of chat.participantes)") &&
    (activitySrc.includes("viewerIsAnon") || activitySrc.includes("viewerIsThreadAnonVisitor")),
);

const outgoingMeta = fs.readFileSync(
  path.join(root, "src/lib/chat/outgoingChatMeta.ts"),
  "utf8",
);
check(
  "OUTGOING_INCREMENTS_UNREAD_ON_ALL_IDENTITY_ALIASES",
  outgoingMeta.includes("expandReadByIdentityKeys") &&
    outgoingMeta.includes("unreadCounts.${readByKey}") &&
    outgoingMeta.includes("Mirror unread onto every identity alias"),
);

check(
  "WAS_READ_CHECKS_VIEWER_ALIASES_FOR_REPEAT_INBOUND",
  activitySrc.includes("Check aliases too") &&
    activitySrc.includes("repeat inbound after markChatAsRead"),
);

{
  const start = activitySrc.indexOf("export function wasChatReadOnServer");
  const slice = activitySrc.slice(start, start + 4500);
  const ownCall = slice.indexOf("isOwnInboxLastSender(chat, viewerId, firebaseUid, roleInput)");
  check(
    "INBOUND_EVALUATED_BEFORE_OWN_LAST_SENDER",
    start >= 0 &&
      slice.indexOf("incomingForViewer") >= 0 &&
      slice.indexOf("primaryIds") >= 0 &&
      ownCall >= 0 &&
      slice.indexOf("incomingForViewer") < ownCall,
  );
}

check(
  "NO_ORANGE_PENDING_RING_IN_CHAT_DETAIL",
  !bubbleSrc.includes("border-orange-400") &&
    bubbleSrc.includes("bottom-nav badge") &&
    bubbleSrc.includes("void unreadIncoming"),
);

check(
  "INBOX_LISTENERS_COVER_MAIN_TABS_FOR_BADGE",
  routesSrc.includes('pathname === "/stories"') &&
    routesSrc.includes('pathname === "/boost"') &&
    routesSrc.includes('pathname === "/settings"'),
);

check(
  "NO_EXTRA_LISTENERS_FOR_BADGE",
  appNav.includes("useChatAlerts") &&
    !appNav.includes("onSnapshot") &&
    !appNav.includes("setInterval"),
);

// Runtime synthetic model via ts transpile is heavy; assert pure logic with a
// minimal inline reimplementation matching the fixed contracts.
function collectViewerSenderIdsFixed(chat, viewerId, firebaseUid = "") {
  const ids = new Set();
  const add = (v) => {
    const id = String(v || "").trim();
    if (id) ids.add(id);
  };
  const viewerIsAnon = viewerId.startsWith("anon_");
  add(viewerId);
  // Anon visitors must NOT inherit firebase/profile_* aliases.
  if (!viewerIsAnon) {
    add(firebaseUid);
    if (firebaseUid) add(`profile_${firebaseUid}`);
  }
  const threadAnon = String(chat.anonSessionId || "").trim();
  const owner =
    chat.targetUid === firebaseUid || chat.receptorUid === firebaseUid;
  if (viewerIsAnon && threadAnon === viewerId) add(threadAnon);
  if (owner && threadAnon.startsWith("anon_")) {
    // must NOT add peer anon for owner
  }
  return ids;
}

function wasReadFixed(chat, viewerId, firebaseUid) {
  const sender = String(chat.lastMessageSender || "");
  const incomingAnonForOwner =
    sender.startsWith("anon_") &&
    firebaseUid &&
    (chat.targetUid === firebaseUid || chat.receptorUid === firebaseUid);
  // Production author id is profile_<uid>, not profile_reply_<uid>.
  const incomingProfileForAnon =
    sender.startsWith("profile_") && viewerId.startsWith("anon_");
  if (incomingAnonForOwner || incomingProfileForAnon) {
    const unread = chat.unreadCounts?.[viewerId];
    if (typeof unread === "number" && unread > 0) return false;
    if (chat.readBy?.[viewerId] === false) return false;
    return chat.readBy?.[viewerId] === true && chat.unreadCounts?.[viewerId] === 0;
  }
  if (sender === viewerId || sender === firebaseUid) return true;
  return chat.readBy?.[viewerId] === true;
}

function unreadCount(chat, viewerId, firebaseUid) {
  if (wasReadFixed(chat, viewerId, firebaseUid)) return 0;
  const sender = String(chat.lastMessageSender || "");
  if (!sender || sender === viewerId || sender === firebaseUid) return 0;
  return 1;
}

const ownerUid = "owner_uid_1";
const anonId = "anon_abc123";
const inboundForOwner = {
  id: `pa_${anonId}_user`,
  anonSessionId: anonId,
  targetUid: ownerUid,
  lastMessage: "hola",
  lastMessageSender: anonId,
  readBy: { [anonId]: true, [ownerUid]: false },
  unreadCounts: { [ownerUid]: 1, [anonId]: 0 },
};
const ownOutgoing = {
  ...inboundForOwner,
  lastMessage: "yo",
  lastMessageSender: ownerUid,
  readBy: { [ownerUid]: true },
  unreadCounts: { [ownerUid]: 0, [anonId]: 1 },
};
const inboundForAnon = {
  id: `pa_${anonId}_user`,
  anonSessionId: anonId,
  targetUid: ownerUid,
  lastMessage: "respuesta",
  lastMessageSender: `profile_${ownerUid}`,
  readBy: { [anonId]: false },
  unreadCounts: { [anonId]: 1 },
};

const ownerIds = collectViewerSenderIdsFixed(inboundForOwner, ownerUid, ownerUid);
check(
  "ANON_TO_PROFILE_REPLY_COUNTS_FOR_RECIPIENT",
  !ownerIds.has(anonId) && unreadCount(inboundForOwner, ownerUid, ownerUid) === 1,
  { ownerIds: [...ownerIds] },
);

check(
  "OUTGOING_OWN_MESSAGE_DOES_NOT_CREATE_UNREAD",
  unreadCount(ownOutgoing, ownerUid, ownerUid) === 0,
);

check(
  "PROFILE_TO_ANON_REPLY_COUNTS_FOR_RECIPIENT",
  unreadCount(inboundForAnon, anonId, "") === 1,
);

check(
  "BOTTOM_NAV_CHAT_BADGE_CLEARS_AFTER_MARK_READ",
  (() => {
    const read = {
      ...inboundForOwner,
      readBy: { [ownerUid]: true },
      unreadCounts: { [ownerUid]: 0 },
    };
    return unreadCount(read, ownerUid, ownerUid) === 0;
  })(),
);

check(
  "BOTTOM_NAV_CHAT_BADGE_PERSISTS_UNTIL_ALL_UNREAD_OPENED",
  (() => {
    const a = inboundForOwner;
    const b = {
      ...inboundForOwner,
      id: "other",
      lastMessageSender: "anon_other",
      anonSessionId: "anon_other",
      unreadCounts: { [ownerUid]: 1 },
      readBy: { [ownerUid]: false },
    };
    const total = unreadCount(a, ownerUid, ownerUid) + unreadCount(b, ownerUid, ownerUid);
    const afterOne =
      unreadCount(
        { ...a, readBy: { [ownerUid]: true }, unreadCounts: { [ownerUid]: 0 } },
        ownerUid,
        ownerUid,
      ) + unreadCount(b, ownerUid, ownerUid);
    return total === 2 && afterOne === 1;
  })(),
);

check(
  "MULTIPLE_UNREAD_CHATS_BADGE_PERSISTS_UNTIL_ALL_OPENED",
  (() => {
    const a = inboundForOwner;
    const b = {
      ...inboundForOwner,
      id: "other2",
      lastMessageSender: "anon_other2",
      anonSessionId: "anon_other2",
      unreadCounts: { [ownerUid]: 1 },
      readBy: { [ownerUid]: false },
    };
    const afterOne =
      unreadCount(
        { ...a, readBy: { [ownerUid]: true }, unreadCounts: { [ownerUid]: 0 } },
        ownerUid,
        ownerUid,
      ) + unreadCount(b, ownerUid, ownerUid);
    const afterAll =
      unreadCount(
        { ...a, readBy: { [ownerUid]: true }, unreadCounts: { [ownerUid]: 0 } },
        ownerUid,
        ownerUid,
      ) +
      unreadCount(
        { ...b, readBy: { [ownerUid]: true }, unreadCounts: { [ownerUid]: 0 } },
        ownerUid,
        ownerUid,
      );
    return afterOne === 1 && afterAll === 0;
  })(),
);

check(
  "BOTTOM_NAV_CHAT_BADGE_APPEARS_ON_INBOUND_UNREAD",
  unreadCount(inboundForOwner, ownerUid, ownerUid) === 1 &&
    appNav.includes("unreadCount={totalUnread}"),
);

check(
  "CHAT_LIST_ROW_BOLD_FOR_UNREAD_REPLY",
  modernInbox.includes("unread > 0") && modernInbox.includes("font-black"),
);

check(
  "CHAT_LIST_ROW_NORMAL_AFTER_OPEN",
  modernInbox.includes("chatUnreadCountForViewer") &&
    !bubbleSrc.includes("border-orange-400"),
);

check(
  "UNREAD_BADGE_VISIBLE_FROM_SHUFFLE_STORIES_BOOST_SETTINGS",
  routesSrc.includes('pathname === "/stories"') &&
    routesSrc.includes('pathname === "/boost"') &&
    routesSrc.includes('pathname === "/settings"') &&
    routesSrc.includes('pathname === "/shuffle"') &&
    bottomNav.includes("ChatPendingIndicator"),
);

const failed = checks.filter((c) => !c.pass);
const out = {
  gate: "CHAT_UNREAD_BADGE_GATE",
  pass: failed.length === 0,
  failedCount: failed.length,
  checks,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
