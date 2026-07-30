import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const unreadSrc = fs.readFileSync(path.join(root, "src/lib/chat/unread.ts"), "utf8");
const pendingSrc = fs.readFileSync(path.join(root, "src/lib/chat/threadPending.ts"), "utf8");
const activitySrc = fs.readFileSync(
  path.join(root, "src/lib/chat/incomingChatActivity.ts"),
  "utf8",
);
const shouldSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/shouldMarkThreadRead.ts"),
  "utf8",
);
const profileSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const toolbarSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ChatsSelectionToolbar.tsx"),
  "utf8",
);
const markAllBtnSrc = fs.readFileSync(
  path.join(root, "src/components/chats/ChatsMarkAllSeenButton.tsx"),
  "utf8",
);
const adminRouteSrc = fs.readFileSync(
  path.join(root, "src/app/api/admin/action/route.ts"),
  "utf8",
);
const adminVerifySrc = fs.readFileSync(
  path.join(root, "src/lib/admin/verifyAdminRequest.ts"),
  "utf8",
);
const postAdminSrc = fs.readFileSync(
  path.join(root, "src/lib/admin/postAdminAction.ts"),
  "utf8",
);

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

check(
  "STABLE_ACTIVITY_KEY_USES_MESSAGE_ID",
  activitySrc.includes('if (latestMessageId) return `id:${latestMessageId}`') &&
    !/chatActivityKey[\s\S]*lastMessageAt\?\.toMillis/.test(activitySrc),
);
check(
  "PENDING_LOCAL_READ_BEFORE_SERVER_UNREAD",
  pendingSrc.includes("localRead || readMessageIdMatch") &&
    pendingSrc.indexOf("localRead || readMessageIdMatch") <
      pendingSrc.indexOf('reason = "server-unread-signal"'),
);
check(
  "MARK_READ_WRITES_LATEST_READ_MESSAGE_IDS",
  unreadSrc.includes("latestReadMessageIds.${viewerId}") &&
    unreadSrc.includes("markAllPendingChatsAsRead") &&
    unreadSrc.includes("markThreadReadExact"),
);
check(
  "DETAIL_MARK_AFTER_RENDER_ALIAS_AWARE",
  profileSrc.includes("markThreadReadExact") &&
    profileSrc.includes("isExactActiveDetailThread") &&
    profileSrc.includes("detail-rendered"),
);
check(
  "SHOULD_MARK_THREAD_READ_HELPER",
  shouldSrc.includes("export function shouldMarkThreadRead") &&
    shouldSrc.includes("renderedInboundMessageIds.includes(latestInboundMessageId)"),
);
check(
  "MARK_ALL_SEEN_UI",
  toolbarSrc.includes("ChatsMarkAllSeenButton") &&
    markAllBtnSrc.includes("markAllPendingChatsAsRead") &&
    markAllBtnSrc.includes('data-chats-mark-all-seen="1"'),
);
check(
  "ADMIN_REPLY_REQUIRES_TOKEN_AND_EXISTS",
  adminRouteSrc.includes("reply_general_claim") &&
    adminRouteSrc.includes("verifyAdminIdToken") &&
    adminRouteSrc.includes("claim_not_found") &&
    adminVerifySrc.includes("verifyIdToken") &&
    postAdminSrc.includes("Authorization"),
);

const report = {
  gate: "FINAL_READSTATE_ADMIN_STATIC",
  pass: checks.every((c) => c.pass),
  checks,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
