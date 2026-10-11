import assert from "node:assert/strict";
import {createRequire} from "node:module";
import fs from "node:fs";
const req=createRequire(import.meta.url);
const {isOppositeSideProfileAnonMessage,selectUnreadNotificationLines}=req("../functions/lib/unreadNotificationLines.js");
const owner="firebase_owner", visitor="firebase_visitor";
const messages=[
{id:"a",fromUid:"anon_old_rotated",senderKind:"anon",texto:"mi propio mensaje anterior",createdAtMs:10},
{id:"b",fromUid:"profile_"+owner,senderKind:"profile",texto:"respuesta recibida",createdAtMs:20},
{id:"c",fromUid:"anon_latest_rotated",senderRole:"anon",texto:"mi segundo mensaje",createdAtMs:30},
{id:"d",fromUid:"profile_"+owner,senderRole:"profile",texto:"respuesta nueva",createdAtMs:40},
];
const forVisitor=selectUnreadNotificationLines({messages,recipientUid:visitor,ownSenderAliases:["anon_latest_rotated"],profileAnonOwnerUid:owner,titleForMessage:()=>"Peer"});
assert.deepEqual(forVisitor.map(r=>r.t),["respuesta recibida","respuesta nueva"],"old rotated visitor aliases must not leak into notification");
const forOwner=selectUnreadNotificationLines({messages,recipientUid:owner,profileAnonOwnerUid:owner,titleForMessage:()=>"Anon"});
assert.deepEqual(forOwner.map(r=>r.t),["mi propio mensaje anterior","mi segundo mensaje"],"owner receives only anon messages");
assert.equal(isOppositeSideProfileAnonMessage(messages[0],visitor,owner),false);
assert.equal(isOppositeSideProfileAnonMessage(messages[1],owner,owner),false);
const sinceReceipt=selectUnreadNotificationLines({
  messages, recipientUid:visitor, profileAnonOwnerUid:owner,
  afterReadAtMs:25, titleForMessage:()=>"Peer",
});
assert.deepEqual(sinceReceipt.map(row=>row.t),["respuesta nueva"],
  "thread readAt must exclude previously seen inbound without message-level receipts");
const sinceMessage=selectUnreadNotificationLines({
  messages, recipientUid:visitor, profileAnonOwnerUid:owner,
  afterReadMessageIds:["b"], titleForMessage:()=>"Peer",
});
assert.deepEqual(sinceMessage.map(row=>row.t),["respuesta nueva"],
  "exact last-read message cuts prior notification history");
const detail=fs.readFileSync("src/components/chat/ProfileAnonChat.tsx","utf8");
const globalAlerts=fs.readFileSync("src/hooks/useGlobalChatAlerts.ts","utf8");
const whip=fs.readFileSync("src/lib/chat/globalChatWhipManager.ts","utf8");
assert.match(detail,/filter\(isPersistedInbound\)/);
assert.match(globalAlerts,/resolveChatViewerId\(chat, firebaseUid\)/);
assert.match(whip,/!chat && chatId\.includes\("__anon_to__"\)/);
console.log(JSON.stringify({gate:"PROFILE_ANON_DIRECTION_AND_EXACT_RECEIPTS",pass:true}));
