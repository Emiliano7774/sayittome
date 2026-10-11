/** Regression: own messages never notify; opening the exact inbound thread clears bold/orange. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);
const load = async (p) => import(pathToFileURL(path.join(root, p)).href);
const { isIncomingMessageFromDoc } = await load("src/lib/chat/incomingChatActivity.ts");
const { chatUnreadCountForViewer } = await load("src/lib/chat/inboxUnread.ts");
const { markChatReadLocally } = await load("src/lib/chat/localChatRead.ts");
const { computeThreadPendingForViewer } = await load("src/lib/chat/threadPending.ts");

const owner = "registered_owner";
const visitor = "anon_visitor_local";
const id = visitor + "__anon_to__owner";
const incoming = {
  id, canonicalChatId: id,
  targetUid: owner, receptorUid: owner,
  anonSessionId: visitor, participantes: [visitor, owner],
  lastMessage: "mensaje recibido", lastMessageSender: visitor,
  latestSenderKind: "anon", latestSenderAnonSessionId: visitor,
  latestMessageId: "m-read-1", lastMessageAt: { seconds: 1000 },
  unreadCounts: { [owner]: 1 },
  readBy: { [owner]: false },
};
assert.equal(chatUnreadCountForViewer(incoming, owner), 1, "unseen inbound must stay bold");
assert.equal(isIncomingMessageFromDoc({ fromUid: visitor, senderKind: "anon" },
  owner, owner, incoming), true, "a real visitor must notify the owner");
assert.equal(isIncomingMessageFromDoc({ fromUid: visitor, senderKind: "anon", senderAuthUid: owner },
  owner, owner, incoming), false, "own authUid beats stale anonymous author alias");
assert.equal(isIncomingMessageFromDoc({ fromUid: "profile_" + owner, senderKind: "profile", senderAuthUid: owner },
  visitor, owner, incoming), false, "own profile send must not notify same logged-in installation");
assert.equal(isIncomingMessageFromDoc({ fromUid: "profile_" + owner, senderKind: "profile" },
  visitor, "different_auth", incoming, { viewerKind: "anon" }), true,
  "incoming owner reply still notifies the distinct visitor");

markChatReadLocally(incoming, owner, owner);
assert.equal(chatUnreadCountForViewer(incoming, owner), 0,
  "exact visible inbound read beats stale server unread");
assert.equal(computeThreadPendingForViewer(incoming, owner).computedPending, false,
  "bottom tick must match row after detail read");
const next = { ...incoming, latestMessageId: "m-read-2", lastMessage: "mensaje posterior" };
assert.equal(chatUnreadCountForViewer(next, owner), 1,
  "next distinct inbound message must still re-enable bold/tick");

const detail = fs.readFileSync(path.join(root, "src/components/chat/ProfileAnonChat.tsx"), "utf8");
const alerts = fs.readFileSync(path.join(root, "src/hooks/useGlobalChatAlerts.ts"), "utf8");
const whip = fs.readFileSync(path.join(root, "src/lib/chat/globalChatWhipManager.ts"), "utf8");
assert.match(detail, /ownerViewing: isOwnerViewing/, "detail passes proven role into read writer");
assert.match(detail, /ctx\.ownerViewing \? ctx\.currentUid : senderId/, "owner marks with auth UID");
const delta = alerts.split("    for (const chat of unreadSource) {").at(-1).split("  }, [")[0];
assert.match(delta, /isIncomingChatActivity\(chat, threadViewer, firebaseUid\)/,
  "inbox delta still proves opposite-side authorship");
assert.doesNotMatch(delta, /if \(chatUnreadCountForViewer\(/,
  "incoming web banners must not depend on delayed unread badge metadata");
assert.match(whip, /senderAuthUid\?: string/);
console.log("PASS OWN_NOTIFICATION_AND_EXACT_READ: own auth suppresses, visible detail clears, new inbound reopens");
