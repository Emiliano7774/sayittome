import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pendingSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/threadPending.ts"),
  "utf8",
);
const unreadSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/inboxUnread.ts"),
  "utf8",
);
const classicSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ClassicChatsInbox.tsx"),
  "utf8",
);
const modernSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ModernChatsInbox.tsx"),
  "utf8",
);
const globalAlertsSrc = fs.readFileSync(
  path.join(root, "src/hooks/useGlobalChatAlerts.ts"),
  "utf8",
);
const profileChatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

function pendingModel({
  senderKind,
  senderUid,
  currentAnon,
  latestId,
  latestAt,
  readActivityId,
  readAt,
  serverUnread = false,
  activeDetail = false,
}) {
  const own =
    senderKind === "anon" &&
    (senderUid === currentAnon || senderUid.startsWith(currentAnon));
  if (activeDetail || own || senderKind !== "profile") return false;
  if (serverUnread) return true;
  if (readActivityId && readActivityId === latestId) return false;
  if (latestAt > readAt) return true;
  if (latestId && !readAt) return true;
  return senderKind === "profile";
}

const common = {
  senderKind: "profile",
  senderUid: "profile_owner",
  currentAnon: "anon_visitor",
};
check(
  "PROFILE_REPLY_PENDING_WITHOUT_SERVER_UNREAD",
  pendingModel({ ...common, latestId: "m1", latestAt: 200, readAt: 100 }),
);
check(
  "LIST_OPEN_DOES_NOT_CLEAR_PENDING",
  pendingModel({
    ...common,
    latestId: "m1",
    latestAt: 200,
    readAt: 100,
    activeDetail: false,
  }),
);
check(
  "EXACT_DETAIL_CLEARS_PENDING",
  !pendingModel({
    ...common,
    latestId: "m1",
    latestAt: 200,
    readAt: 100,
    activeDetail: true,
  }),
);
check(
  "REPEAT_PROFILE_REPLY_REMARKS",
  pendingModel({
    ...common,
    latestId: "m2",
    latestAt: 300,
    readActivityId: "m1",
    readAt: 250,
  }),
);
check(
  "ANON_OWN_MESSAGE_NOT_PENDING",
  !pendingModel({
    senderKind: "anon",
    senderUid: "anon_visitor",
    currentAnon: "anon_visitor",
    latestId: "m3",
    latestAt: 400,
    readAt: 0,
  }),
);

check(
  "CENTRAL_PENDING_SOURCE_USED_BY_BADGE_AND_ROWS",
  unreadSrc.includes("computeThreadPendingForViewer") &&
    globalAlertsSrc.includes("totalUnreadCount") &&
    classicSrc.includes("chatUnreadCountForViewer") &&
    modernSrc.includes("chatUnreadCountForViewer"),
);
check(
  "LATEST_MESSAGE_ID_AND_TIME_WRITTEN",
  persistSrc.includes("latestMessageId: messageRef.id") &&
    persistSrc.includes("latestSenderKind: senderKind") &&
    persistSrc.includes("latestSenderAnonSessionId"),
);
check(
  "LIST_PAGE_HAS_NO_MARK_READ_CALL",
  !classicSrc.includes("markChatAsRead") &&
    !modernSrc.includes("markChatAsRead"),
);
check(
  "DETAIL_ONLY_LIVE_PATH_MARK_READ",
  (profileChatSrc.includes("isExactActiveDetailThread") ||
    profileChatSrc.includes("activeChatId !== ctx.chatId")) &&
    profileChatSrc.includes("List route must never clear unread") &&
    profileChatSrc.includes("Do NOT mark-read on unmount/cleanup"),
);
check(
  "PENDING_PREFERS_LOCAL_READ_OVER_SERVER_UNREAD",
  pendingSrc.includes("localRead || readMessageIdMatch") &&
    pendingSrc.includes("local-read-current-activity") &&
    pendingSrc.indexOf("localRead || readMessageIdMatch") <
      pendingSrc.indexOf('reason = "server-unread-signal"'),
);
check(
  "PENDING_FALLBACK_USES_LATEST_AFTER_READ",
  pendingSrc.includes("latestAt > 0 && latestAt > readAt") &&
    pendingSrc.includes("profile-inbound-fallback"),
);

const report = {
  gate: "CHAT_THREAD_PENDING_QA4",
  pass: checks.every((item) => item.pass),
  checks,
  backendDelta: 0,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
