/** Reproduction: a profile-anon thread survives many anon identity changes. */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);
const load = async name => import(pathToFileURL(path.join(root, name)).href);
const { isIncomingChatActivity, isIncomingMessageFromDoc, resolveChatViewerRole } = await load("src/lib/chat/incomingChatActivity.ts");
const { chatUnreadCountForViewer } = await load("src/lib/chat/inboxUnread.ts");
const { markChatReadLocally } = await load("src/lib/chat/localChatRead.ts");
const owner="registered_owner_for_qa", visitor="registered_visitor_for_qa";
const thread="anon_first_ephemeral__anon_to__qaowner";
const create = (sender, kind, mid) => ({
  id:thread, canonicalChatId:thread, targetUid:owner, receptorUid:owner,
  anonSessionId:"anon_first_ephemeral", participantes:["anon_first_ephemeral",owner],
  lastMessage:"QA current message", lastMessageSender:sender,
  latestSenderKind:kind, latestMessageId:mid,
  lastMessageAt:{seconds:1500},
  unreadCounts:{[owner]:2,[visitor]:2,anon_first_ephemeral:2},
  readBy:{[owner]:false,[visitor]:false,anon_first_ephemeral:false},
});
const ownRotated = create("anon_third_ephemeral","anon","qa_msg1");
assert.equal(resolveChatViewerRole({viewerId:visitor,firebaseUid:visitor,chat:ownRotated}).viewerKind,"anon");
assert.equal(isIncomingChatActivity(ownRotated,visitor,visitor),false,
 "a visitor's own old anon send is NOT incoming after session rotation");
assert.equal(isIncomingMessageFromDoc({fromUid:"anon_third_ephemeral",senderKind:"anon"},
 visitor,visitor,ownRotated),false,"no notification from own rotated anon send");
assert.equal(chatUnreadCountForViewer(ownRotated,visitor),0,
 "a stale server unread count must not create orange tick on own send");
const reply = create("profile_"+owner,"profile","qa_msg2");
assert.equal(isIncomingChatActivity(reply,visitor,visitor),true,
 "the same visitor MUST still receive real profile replies");
assert.equal(isIncomingMessageFromDoc({fromUid:"profile_"+owner,senderKind:"profile"},
 visitor,visitor,reply),true);
assert.equal(chatUnreadCountForViewer(reply,visitor),1);
markChatReadLocally(reply,visitor,visitor);
assert.equal(chatUnreadCountForViewer(reply,visitor),0,
 "opening and reading inbound must remove bold and orange");
const nextReply = create("profile_"+owner,"profile","qa_msg3");
assert.equal(chatUnreadCountForViewer(nextReply,visitor),1,
 "a genuinely new reply must reappear in inbox");
const ownProfile = create("profile_"+owner,"profile","qa_profile1");
assert.equal(isIncomingChatActivity(ownProfile,owner,owner),false);
assert.equal(isIncomingMessageFromDoc({fromUid:"profile_"+owner,senderKind:"profile"},
 owner,owner,ownProfile),false);
assert.equal(chatUnreadCountForViewer(ownProfile,owner),0);
const incomingAnon = create("anon_other_rotated","anon","qa_profile2");
assert.equal(isIncomingChatActivity(incomingAnon,owner,owner),true);
assert.equal(isIncomingMessageFromDoc({fromUid:"anon_other_rotated",senderKind:"anon"},
 owner,owner,incomingAnon),true);
assert.equal(chatUnreadCountForViewer(incomingAnon,owner),1);
markChatReadLocally(incomingAnon,owner,owner);
assert.equal(chatUnreadCountForViewer(incomingAnon,owner),0);
console.log(JSON.stringify({gate:"ROTATED_ANON_DIRECTION_READ",pass:true,checks:14}));
