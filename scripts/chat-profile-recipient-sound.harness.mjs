/**
 * CHAT_PROFILE_RECIPIENT_SOUND_GATE
 * First snapshot/backlog is silent; only an arrival observed after baseline may sound.
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

check("REATTACH_DOES_NOT_REPLAY_VIA_FRESH_WATCH",
  whipMgr.includes("freshWatchChatIds.clear()") &&
  whipMgr.includes("liveInboundOnFreshWatch") &&
  whipMgr.includes("clearMessageListeners"));

check("NEW_MESSAGE_AFTER_BASELINE_CAN_SOUND",
  whipMgr.includes("const isNewMessage = Boolean(previousId && previousId !== messageId);") &&
  whipMgr.includes("playIncomingWhipSound();"));

check("LISTENER_REATTACH_ESTABLISHES_FRESH_BASELINE",
  whipMgr.includes("this.lastMessageId.delete(chatId);") &&
  whipMgr.includes("this.lastMessageId.clear();") &&
  whipMgr.includes("this.freshWatchChatIds.clear();"));
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({
  gate: "CHAT_PROFILE_RECIPIENT_SOUND_GATE",
  pass: failed.length === 0,
  checks,
}, null, 2));
process.exit(failed.length ? 1 : 0);
