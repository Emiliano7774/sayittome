/**
 * CHAT_ANON_RECIPIENT_UNREAD_GATE
 *   node --experimental-strip-types scripts/chat-anon-recipient-unread.harness.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

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

const activity = await import(
  pathToFileURL(path.join(root, "src/lib/chat/incomingChatActivity.ts")).href
);

const profileAnonChat = {
  id: "anon_sess1__anon_to__maria",
  canonicalChatId: "anon_sess1__anon_to__maria",
  targetUid: "owner_uid",
  receptorUid: "owner_uid",
  anonSessionId: "anon_sess1",
  lastMessage: "hola",
  lastMessageSender: "profile_owner_uid",
  readBy: {},
  unreadCounts: {},
};

const anonVisitorId = "anon_sess1";
const staleFirebaseUid = "firebase_uid_still_in_browser";

const anonViewerIds = activity.collectViewerSenderIds(
  profileAnonChat,
  anonVisitorId,
  staleFirebaseUid,
  { viewerKind: "anon" },
);
check(
  "ANON_VISITOR_EXCLUDES_FIREBASE_UID_ALIASES",
  activitySrc.includes("must NOT inherit the browser Firebase uid") &&
    activitySrc.includes("viewerIsAnon") &&
    activitySrc.includes("if (!viewerIsAnon)") &&
    !anonViewerIds.has(staleFirebaseUid) &&
    !anonViewerIds.has(`profile_${staleFirebaseUid}`) &&
    anonViewerIds.has(anonVisitorId),
  {
    anonViewerIds: [...anonViewerIds],
  },
);

const ownerViewerIds = activity.collectViewerSenderIds(
  profileAnonChat,
  staleFirebaseUid,
  staleFirebaseUid,
  { viewerKind: "owner", provenOwner: true },
);
check(
  "PROFILE_OWNER_KEEPS_FIREBASE_UID_ALIASES",
  ownerViewerIds.has(staleFirebaseUid) &&
    ownerViewerIds.has(`profile_${staleFirebaseUid}`),
  {
    ownerViewerIds: [...ownerViewerIds],
  },
);

check(
  "ANON_VISITOR_PROFILE_REPLY_IS_INCOMING_NOT_OWN",
  activity.isIncomingProfileReplyForAnonVisitor(
    "profile_owner_uid",
    anonVisitorId,
    staleFirebaseUid,
    profileAnonChat,
    { viewerKind: "anon" },
  ) &&
    !activity.isOwnChatSender(
      "profile_owner_uid",
      anonVisitorId,
      staleFirebaseUid,
      profileAnonChat,
      { viewerKind: "anon" },
    ),
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
