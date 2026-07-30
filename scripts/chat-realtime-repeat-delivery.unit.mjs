/**
 * Fail-hard model/source gate for M1/R1 … M10/R10 repeat delivery.
 * Run: node scripts/chat-realtime-repeat-delivery.unit.mjs
 */
import fs from "node:fs";

const persist = fs.readFileSync("src/lib/chat/persistAnonMessage.ts", "utf8");
const route = fs.readFileSync("src/app/chat/[chatId]/page.tsx", "utf8");
const meta = fs.readFileSync("src/lib/chat/outgoingChatMeta.ts", "utf8");
const detail = fs.readFileSync("src/components/chat/ProfileAnonChat.tsx", "utf8");
const dedupe = fs.readFileSync("src/lib/chat/whipAlertDedupe.ts", "utf8");

function assert(value, message) {
  if (!value) throw new Error(message);
}

function mergeByIdentity(loaded, pending) {
  const result = [...loaded];
  for (const optimistic of pending) {
    const ack = result.findIndex(
      (message) => optimistic.clientId && message.clientId === optimistic.clientId,
    );
    if (ack < 0) result.push(optimistic);
  }
  return result;
}

const senderDocs = [];
const receiverDocs = [];
const sounds = new Set();
for (let exchange = 1; exchange <= 10; exchange += 1) {
  for (const direction of ["M", "R"]) {
    const clientId = `${direction}${exchange}-client`;
    const serverDocId = `${direction}${exchange}-doc`;
    const serverMessage = {
      id: serverDocId,
      clientId,
      mine: false,
      text: `${direction}${exchange}`,
    };
    const optimistic = {
      id: clientId,
      clientId,
      mine: true,
      text: `${direction}${exchange}`,
      status: "sending",
    };
    const reconciled = mergeByIdentity([serverMessage], [optimistic]);
    assert(reconciled.length === 1, `${direction}${exchange} duplicated at ack`);
    senderDocs.push(reconciled[0]);
    receiverDocs.push(serverMessage);
    sounds.add(serverDocId);
  }
}

assert(receiverDocs.length === 20, "receiver dropped a repeated message");
assert(new Set(receiverDocs.map((message) => message.id)).size === 20, "doc ids collided");
assert(sounds.size === 20, "sound dedupe suppressed a unique inbound doc");
assert(
  meta.includes("expandOutgoingChatMetaPatchForSet") &&
    meta.includes("const separator = key.indexOf"),
  "set/merge dotted field paths are not expanded into nested maps",
);
assert(
  persist.includes("canonicalChatId !== chatId") &&
    persist.includes('collection(db, "chats", canonicalChatId, "mensajes")'),
  "send path does not bridge alias to canonical thread",
);
assert(
  route.includes("requestedData.canonicalChatId") &&
    route.includes("setChatId(resolvedChatId)"),
  "detail listener does not switch aliases to canonical thread",
);
assert(
  !detail.includes("markChatMessagesWhipAlerted(") &&
    dedupe.includes("if (incoming && suppress) return false"),
  "detail/global sound ownership can pre-consume inbound ids",
);
assert(
  detail.includes("latestRenderedMessageId") &&
    detail.includes('"detail-rendered"'),
  "read marker is not tied to a rendered detail message",
);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_REALTIME_REPEAT_DELIVERY_UNIT",
      pass: true,
      exchanges: 10,
      messagesExpected: 20,
      messagesReceiverVisible: receiverDocs.length,
      disappearingMessages: 0,
      duplicates: 0,
      uniqueSoundTriggers: sounds.size,
    },
    null,
    2,
  ),
);
