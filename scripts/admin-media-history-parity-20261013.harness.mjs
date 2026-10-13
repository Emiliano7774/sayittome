import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveAdminMessageKind, hasAdminMessageAttachment } from "../src/lib/admin/adminMediaPresentation.ts";

const cases = [
  [{type:"media",mediaType:"image",mediaUrl:"https://storage.example/item"},"image"],
  [{type:"media",mediaType:"audio",mediaUrl:"https://storage.example/item"},"audio"],
  [{type:"media",mediaType:"video",mediaUrl:"https://storage.example/item"},"video"],
  [{type:"media",mimeType:"audio/ogg",mediaUrl:"https://storage.example/item"},"audio"],
  [{type:"text",imageUrl:"https://storage.example/item"},"image"],
  [{type:"text",audioUrl:"https://storage.example/item"},"audio"],
  [{type:"text",mediaUrl:"https://storage.example/file.ogg"},"audio"],
  [{type:"text",mediaUrl:"https://storage.example/file.webm",contentType:"audio/webm"},"audio"],
  [{type:"image",viewOnce:true,texto:""},"image"],
  [{type:"video",viewOnce:true,texto:""},"video"],
  [{type:"audio",mediaUrl:"https://storage.example/item"},"audio"],
  [{type:"text",texto:"Hola"},"text"],
];
for (const [row,expected] of cases) {
  assert.equal(resolveAdminMessageKind(row),expected,JSON.stringify(row));
  assert.equal(hasAdminMessageAttachment(row),expected!=="text");
}
assert.equal(hasAdminMessageAttachment({type:"media",mediaUrl:"https://storage.example/noext"}),true);
assert.equal(hasAdminMessageAttachment({type:"text",viewOnce:true}),true);
assert.equal(hasAdminMessageAttachment({type:"media",mediaType:"image",temporal:true}),true);

function source(file){return fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");}
const detail=source("src/app/api/admin/anon-match-chats/route.ts");
const provider=source("src/lib/admin/adminMessageMediaRead.ts");
const raw=source("src/app/api/admin/message-media/route.ts");
const panel=source("src/components/admin/spectator/AdminAnonMatchChatsPanel.tsx");
const viewer=source("src/components/admin/review/AdminSpectatorMessageContent.tsx");
const profile=source("src/components/admin/review/AdminChatMirror.tsx");
assert.match(detail,/type: resolveAdminMessageKind\(data\)/);
assert.match(detail,/hasAttachment: hasAdminMessageAttachment\(data\)/);
assert.match(detail,/rawMessageId: row.id/);
assert.match(panel,/hasAttachment: msg.hasAttachment/);
assert.match(panel,/rawMessageId \|\| msg.id/);
assert.match(provider,/const type = resolveAdminMessageKind\(message\)/);
assert.match(provider,/CHAT_ROOTS = \["chats", "chats_anonimos"\]/);
assert.match(provider,/if \(message.viewOnce === true\)/);
assert.match(raw,/resolveAdminMessageKind\(\{ type: result.type, contentType: media.contentType \}\)/);
assert.match(viewer,/hasAdminMessageAttachment/);
assert.match(viewer,/fetchAdminMediaBlob/);
assert.match(viewer,/ChatAudioPlayer/);
assert.match(viewer,/AdminEvidenceMedia/);
assert.match(profile,/AdminSpectatorMessageContent/);
console.log(JSON.stringify({gate:"ADMIN_MEDIA_HISTORY_ALL_BUCKETS",pass:true,cases:cases.length}));
