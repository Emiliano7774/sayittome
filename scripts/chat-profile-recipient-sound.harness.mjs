/**
 * CHAT_PROFILE_RECIPIENT_SOUND_GATE
 *   node scripts/chat-profile-recipient-sound.harness.mjs
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

check(
  "PROFILE_FIRST_INBOUND_AFTER_ATTACH_CAN_SOUND",
  whipMgr.includes("liveInboundOnAttach") &&
    !whipMgr.includes("if (!isNewMessage) {\n          tryAlertIncomingMessage({\n            chatId,\n            messageId,\n            incoming: false"),
);

check(
  "ATTACH_TIMESTAMP_TRACKED_PER_CHAT",
  whipMgr.includes("listenerAttachedAt") &&
    whipMgr.includes("this.listenerAttachedAt.set(chatId"),
);

const failed = checks.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    { gate: "CHAT_PROFILE_RECIPIENT_SOUND_GATE", pass: failed.length === 0, checks },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
