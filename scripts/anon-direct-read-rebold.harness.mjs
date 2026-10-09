/**
 * Regression for opened anon-direct inbox rows re-bolded by late snapshots.
 * Run: node --experimental-strip-types scripts/anon-direct-read-rebold.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
installHarnessWindow();
installHarnessAlias(root);
const local=await import(pathToFileURL(path.join(root,"src/lib/chat/localChatRead.ts")).href);
const unread=await import(pathToFileURL(path.join(root,"src/lib/chat/inboxUnread.ts")).href);
globalThis.localStorage.clear();

const chat={
  id:"aad_test_anon_to_anon",
  canonicalChatId:"aad_test_anon_to_anon",
  inboxKind:"anon_direct",
  sourceCollection:"chats_anonimos",
  lastMessage:"Hola",
  lastMessageSender:"firebase_auth_sender_B",
  latestMessageId:"message_1",
  latestReadMessageIds:{"firebase_auth_viewer_A":"message_0"},
  readBy:{"firebase_auth_viewer_A":false},
  unreadCounts:{"firebase_auth_viewer_A":1},
};
function count(row, uid="firebase_auth_viewer_A"){
 return unread.chatUnreadCountForViewer(row,uid);
}
assert.equal(count(chat),1,"incoming message starts unread");
const before=local.getLocalChatReadVersion();
local.markAnonDirectReadLocally(chat.id,"firebase_auth_viewer_A","message_1");
assert.equal(count(chat),0,"opening makes latest message read immediately");
assert.equal(local.getLocalChatReadVersion(),before+1,"local read dispatches repaint event");
local.markAnonDirectReadLocally(chat.id,"firebase_auth_viewer_A","message_1");
assert.equal(local.getLocalChatReadVersion(),before+1,"same message read is idempotent");
const stale={...chat,readBy:{"firebase_auth_viewer_A":false},latestReadMessageIds:{"firebase_auth_viewer_A":"message_0"}};
assert.equal(count(stale),0,"late stale server snapshot must not re-bold");
assert.equal(count(chat,"firebase_auth_viewer_OTHER"),1,"read cannot leak to another account");
const newer={...chat,lastMessage:"Nuevo",latestMessageId:"message_2"};
assert.equal(count(newer),1,"real new message must re-bold");
assert.equal(count({...chat,latestMessageId:""}),1,"missing ID must not broadly suppress unread");
const localSrc=fs.readFileSync(path.join(root,"src/components/anonMatch/AnonDirectChatWindow.tsx"),"utf8");
assert.match(localSrc,/markAnonDirectChatRead\(\{/,"opened direct chat persists an exact read receipt");
console.log("PASS ANON_DIRECT_READ_REBOLD: read stays cleared on stale snapshot, new messages remain unread, account isolation, idempotent updates");
