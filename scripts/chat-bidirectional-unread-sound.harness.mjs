/**
 * CHAT_BIDIRECTIONAL_UNREAD_SOUND_GATE
 *   node scripts/chat-bidirectional-unread-sound.harness.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const whipMgr = fs.readFileSync(
  path.join(root, "src/lib/chat/globalChatWhipManager.ts"),
  "utf8",
);
const whipSound = fs.readFileSync(
  path.join(root, "src/lib/chat/whipSound.ts"),
  "utf8",
);
const dedupe = fs.readFileSync(
  path.join(root, "src/lib/chat/whipAlertDedupe.ts"),
  "utf8",
);
const activity = fs.readFileSync(
  path.join(root, "src/lib/chat/incomingChatActivity.ts"),
  "utf8",
);

check(
  "PROFILE_INBOUND_AND_ANON_INBOUND_CLASSIFIED",
  activity.includes("isIncomingAnonMessageForProfileOwner") &&
    activity.includes("isIncomingProfileReplyForAnonVisitor"),
);

check(
  "SOUND_PLAYS_VIA_WHIP_MP3",
  whipSound.includes("/sounds/whip.mp3") &&
    whipSound.includes("playIncomingWhipSound"),
);

check(
  "DEDUPE_BY_CHAT_MESSAGE_ID",
  dedupe.includes("chatId:messageId") || dedupe.includes("alertKey(chatId, messageId)"),
);

check(
  "FIRST_ATTACH_LIVE_INBOUND_NOT_HYDRATION",
  whipMgr.includes("liveInboundOnAttach") &&
    whipMgr.includes("unreadHint") &&
    whipMgr.includes("createdAtMs"),
);

check(
  "ACTIVE_CHAT_SUPPRESSES_SOUND",
  whipMgr.includes("viewingActiveChat") &&
    whipMgr.includes("suppress: viewingActiveChat"),
);

const failed = checks.filter((c) => !c.pass);
const report = {
  gate: "CHAT_BIDIRECTIONAL_UNREAD_SOUND_GATE",
  pass: failed.length === 0,
  checks,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
