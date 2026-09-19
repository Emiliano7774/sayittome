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
const nextConfig = read("next.config.ts");

assert.match(route, /verifyAdminIdToken\(req\)/);
assert.match(route, /handleAdminAnonExpressChatsGet/);
assert.match(route, /Cache-Control.*private, no-store/);
assert.match(nextConfig, /api\/admin\/anon-express-chats/);
assert.match(nextConfig, /private, no-store, max-age=0, must-revalidate/);
assert.match(server, /collection\("chats_anonimos"\)/);
assert.match(server, /collectionName of \["mensajes", "messages"\]/);
assert.match(server, /CHAT_PAGE_SIZE = 250/);
assert.match(server, /cursorSnap/);
assert.match(server, /startAfter\(cursorSnap\)/);
assert.doesNotMatch(server, /firebase-admin\/firestore/);
assert.match(server, /nextCursor/);
assert.doesNotMatch(server, /MAX_MESSAGES|slice\(0, MAX_MESSAGES\)/);
assert.match(server, /chat_not_found/);
assert.match(panel, /Chats Express/);
assert.match(panel, /mark_anon_chat_suspicious/);
assert.match(panel, /unmark_anon_chat_suspicious/);
assert.match(panel, /delete_anon_chat/);
assert.match(panel, /delete_anon_message/);
assert.match(panel, /AdminSpectatorMessageContent/);
assert.match(panel, /do \{/);
assert.match(panel, /seenCursors/);
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
