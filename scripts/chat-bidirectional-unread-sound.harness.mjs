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

const whipMgr = fs.readFileSync(path.join(root, "src/lib/chat/globalChatWhipManager.ts"), "utf8");
const whipSound = fs.readFileSync(path.join(root, "src/lib/chat/whipSound.ts"), "utf8");
const dedupe = fs.readFileSync(path.join(root, "src/lib/chat/whipAlertDedupe.ts"), "utf8");
const activity = fs.readFileSync(path.join(root, "src/lib/chat/incomingChatActivity.ts"), "utf8");
const profileDetail = fs.readFileSync(path.join(root, "src/components/chat/ProfileAnonChat.tsx"), "utf8");
const detailWhip = fs.readFileSync(path.join(root, "src/hooks/useIncomingMessageWhip.ts"), "utf8");

check("PROFILE_INBOUND_AND_ANON_INBOUND_CLASSIFIED",
  activity.includes("isIncomingAnonMessageForProfileOwner") &&
  activity.includes("isIncomingProfileReplyForAnonVisitor"));
check("SOUND_PLAYS_VIA_WHIP_MP3",
  whipSound.includes("/sounds/whip.mp3") && whipSound.includes("playIncomingWhipSound"));
check("DEDUPE_BY_CHAT_MESSAGE_ID",
  dedupe.includes("chatId:messageId") || dedupe.includes("alertKey(chatId, messageId)"));check("FIRST_SNAPSHOT_IS_BASELINE_ONLY",
  whipMgr.includes("if (!previousId) {") &&
  whipMgr.includes("this.lastMessageId.set(chatId, messageId);") &&
  whipMgr.includes("First snapshot is baseline only") &&
  !whipMgr.includes("liveInboundOnAttach"));
check("ONLY_POST_BASELINE_MESSAGE_ID_CHANGE_CAN_SOUND",
  whipMgr.includes("const isNewMessage = previousId !== messageId;") &&
  whipMgr.includes("if (!isNewMessage) return;"));
check("REATTACH_RESETS_BASELINE",
  whipMgr.includes("this.lastMessageId.delete(chatId);") &&
  whipMgr.includes("this.lastMessageId.clear();"));
check("ACTIVE_CHAT_HANDS_SOUND_TO_DETAIL_WITHOUT_PREBURN",
  whipMgr.includes("suppress: viewingActiveChat") &&
  dedupe.includes("if (incoming && suppress) return false") &&
  !profileDetail.includes("markChatMessagesWhipAlerted(") &&
  detailWhip.includes("CHAT_INBOUND_WHIP_TRIGGERED"));

const failed = checks.filter((c) => !c.pass);
const report = { gate: "CHAT_BIDIRECTIONAL_UNREAD_SOUND_GATE", pass: failed.length === 0, checks };
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
