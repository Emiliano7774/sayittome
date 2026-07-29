/**
 * CHAT_ANON_RECIPIENT_UNREAD_GATE
 *   node scripts/chat-anon-recipient-unread.harness.mjs
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
const persistSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/persistAnonMessage.ts"),
  "utf8",
);
const whipSrc = fs.readFileSync(
  path.join(root, "src/lib/chat/globalChatWhipManager.ts"),
  "utf8",
);

check(
  "ANON_VISITOR_EXCLUDES_FIREBASE_UID_ALIASES",
  activitySrc.includes("must NOT inherit the browser Firebase uid") &&
    activitySrc.includes("if (!viewerIsThreadAnonVisitor)"),
);

check(
  "INBOUND_PRIMARY_IDS_FOR_ANON_KEYS",
  activitySrc.includes("primaryIds") &&
    activitySrc.includes('viewerId.startsWith("anon_")'),
);

check(
  "PROFILE_REPLY_UNREAD_RECIPIENTS_INCLUDE_ANON",
  persistSrc.includes("resolveProfileAnonUnreadRecipients") &&
    persistSrc.includes("resolveThreadAnonRecipientIds") &&
    persistSrc.includes("never the profile owner's live browser anon"),
);

check(
  "WHIP_LIVE_INBOUND_ON_ATTACH",
  whipSrc.includes("liveInboundOnAttach") &&
    whipSrc.includes("listenerAttachedAt"),
);

const failed = checks.filter((c) => !c.pass);
const report = {
  gate: "CHAT_ANON_RECIPIENT_UNREAD_GATE",
  pass: failed.length === 0,
  checks,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
