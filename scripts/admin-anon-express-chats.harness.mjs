import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const route = read("src/app/api/admin/anon-express-chats/route.ts");
const server = read("src/lib/admin/anonExpressChatsRoute.ts");
const panel = read("src/components/admin/panels/AdminAnonExpressChatsPanel.tsx");
const workspace = read("src/components/admin/AdminModerationWorkspace.tsx");
const actions = read("src/app/api/admin/action/route.ts");
const media = read("src/lib/admin/adminMessageMediaRead.ts");

assert.match(route, /verifyAdminIdToken\(req\)/);
assert.match(route, /handleAdminAnonExpressChatsGet/);
assert.match(server, /collection\("chats_anonimos"\)/);
assert.match(server, /collectionName of \["mensajes", "messages"\]/);
assert.match(server, /MAX_CHATS = 300/);
assert.match(server, /MAX_MESSAGES = 300/);
assert.match(server, /chat_not_found/);
assert.match(panel, /Chats Express/);
assert.match(panel, /mark_anon_chat_suspicious/);
assert.match(panel, /unmark_anon_chat_suspicious/);
assert.match(panel, /delete_anon_chat/);
assert.match(panel, /delete_anon_message/);
assert.match(panel, /AdminSpectatorMessageContent/);
assert.match(workspace, /express_chats/);
assert.match(workspace, /AdminAnonExpressChatsPanel/);
assert.match(actions, /action === "delete_anon_chat"/);
assert.match(actions, /action === "delete_anon_message"/);
assert.match(actions, /action === "mark_anon_chat_suspicious"/);
assert.match(actions, /action === "unmark_anon_chat_suspicious"/);
assert.match(actions, /chats_anonimos\/\$\{chatId\}\/\$\{collectionName\}/);
assert.match(media, /const CHAT_ROOTS = \["chats", "chats_anonimos"\]/);
assert.doesNotMatch(panel, /onSnapshot|collection\(db/);

console.log(JSON.stringify({
  gate: "ADMIN_ANON_EXPRESS_CHATS",
  pass: true,
  protectedRoute: true,
  adminSdkRead: true,
  messageCollections: ["mensajes", "messages"],
  mediaReview: true,
  moderationActions: true,
}));
