import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
const root=path.resolve(".");
const m=await import(pathToFileURL(path.join(root,"src/lib/chat/whipAlertDedupe.ts")).href);
const chat="anon_sender_echo_qa__anon_to__qa";
const client="qa_outbound_unique_client_id";
const message="qa_server_firestore_document";
const inbound="qa_real_inbound_firestore_document";
assert.equal(m.isLocalOutgoingClientId(chat,client),false);
m.markLocalOutgoingClientId(chat,client);
assert.equal(m.isLocalOutgoingClientId(chat,client),true);
assert.equal(m.isLocalOutgoingMessageId(chat,message),false);
m.markLocalOutgoingMessageId(chat,message);
assert.equal(m.isLocalOutgoingMessageId(chat,message),true);
assert.equal(m.wasMessageWhipAlerted(chat,message),true);
let notifications=0;
assert.equal(m.tryAlertIncomingMessage({chatId:chat,messageId:message,incoming:true,suppress:false,onAlert:()=>notifications++}),false);
assert.equal(notifications,0);
assert.equal(m.tryAlertIncomingMessage({chatId:chat,messageId:inbound,incoming:true,suppress:false,onAlert:()=>notifications++}),true);
assert.equal(notifications,1);
assert.equal(m.isLocalOutgoingClientId(chat+"other",client),false);
const sources=[
 "src/components/chat/ProfileAnonChat.tsx",
 "src/hooks/useIncomingMessageWhip.ts",
 "src/lib/chat/globalChatWhipManager.ts",
 "src/hooks/useGlobalChatAlerts.ts",
].map(x=>fs.readFileSync(path.join(root,x),"utf8"));
for(const [i,source] of sources.entries()){
 assert.match(source,i===0?/markLocalOutgoingClientId\(/:i===3?/isLocalOutgoingMessageId\(/:/isLocalOutgoingClientId\(/);
}
console.log(JSON.stringify({gate:"OWN_OUTBOUND_IMMUTABLE_ID_NO_LOCAL_NOTIFICATIONS",pass:true,checks:12}));
