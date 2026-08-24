/**
 * MODERATION_CHAT_ISOLATION_GATE
 *   node --experimental-strip-types scripts/moderation-chat-isolation.harness.mjs
 *
 * Imports production: chatBelongsToProfile, listen generation, admin auth,
 * message collections, spectator owner/visitor, user-chats GET.
 * No production Firestore read/write/migrate.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit", cwd: process.cwd() },
  );
  process.exit(rerun.status ?? 1);
}

const root = process.cwd();
installHarnessWindow();
installHarnessAlias(root);
const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

async function loadTs(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

const {
  chatBelongsToProfile,
  filterChatsOwnedByProfile,
  MODERATION_OWNER_UID_FIELDS,
  exactUsernameEquals,
  moderationActivityWriteUsernames,
  planModerationActivityTouches,
} = await loadTs("src/lib/moderation/chatHistory.ts");
const { buildProfileAnonChatId } = await loadTs("src/lib/chat/anonChatId.ts");
const {
  beginModerationMessageListen,
  initialModerationMessageListenState,
  shouldAcceptModerationMessageSnapshot,
} = await loadTs("src/lib/moderation/moderationMessageListen.ts");
const {
  exactMessageCollectionName,
  mergeModerationMessagePages,
  moderationMessagePath,
  MODERATION_MESSAGE_COLLECTIONS,
} = await loadTs("src/lib/moderation/moderationMessageCollections.ts");
const {
  adminAuthFromHeaders,
  assertAdminAllowlist,
  mapAdminAuthFailure,
} = await loadTs("src/lib/admin/verifyAdminRequest.ts");
const {
  messageDisplayText,
  resolveSpectatorMessageSide,
} = await loadTs("src/lib/moderation/spectator.ts");
const { resolveModerationParticipants } = await loadTs("src/lib/moderation/chatReview.ts");
const { handleAdminUserChatsGet } = await loadTs("src/lib/admin/userChatsRoute.ts");
const { ADMIN_EMAIL } = await loadTs("src/lib/admin/isAdmin.ts");

const visitor = "anon_visitor_v";
const o1 = { username: "owner_one", uid: "uid_o1" };
const o2 = { username: "owner_two", uid: "uid_o2" };
const chatO1 = {
  id: buildProfileAnonChatId(visitor, o1.username),
  targetUsername: o1.username,
  receptorUsername: o1.username,
  targetUid: o1.uid,
  receptorUid: o1.uid,
  anonOwnerUid: o1.uid,
  initiatorUid: visitor,
  anon: true,
};
const chatO2 = {
  id: buildProfileAnonChatId(visitor, o2.username),
  targetUsername: o2.username,
  receptorUsername: o2.username,
  targetUid: o2.uid,
  receptorUid: o2.uid,
  anonOwnerUid: o2.uid,
  initiatorUid: visitor,
  anon: true,
};
const corpus = [chatO1, chatO2];

const o1Only = filterChatsOwnedByProfile(corpus, o1.username, o1.uid);
const o2Only = filterChatsOwnedByProfile(corpus, o2.username, o2.uid);
check("V_TO_O1_O2_ISOLATED", o1Only.length === 1 && o1Only[0].id === chatO1.id && o2Only.length === 1 && o2Only[0].id === chatO2.id, {
  o1: o1Only.map((row) => row.id),
  o2: o2Only.map((row) => row.id),
});
check(
  "VISITOR_INITIATOR_NOT_OWNER",
  chatBelongsToProfile(chatO1, o2.username, visitor) === false &&
    chatBelongsToProfile(chatO2, o1.username, visitor) === false &&
    filterChatsOwnedByProfile(corpus, "unrelated", visitor).length === 0 &&
    !MODERATION_OWNER_UID_FIELDS.includes("initiatorUid") &&
    !MODERATION_OWNER_UID_FIELDS.includes("anonOwnerUid"),
);

const genericLegacy = {
  id: "generic_chat_abc",
  anonOwnerUid: visitor,
  initiatorUid: visitor,
};
check(
  "GENERIC_ANONOWNER_VISITOR_NOT_OWNER",
  chatBelongsToProfile(genericLegacy, "visitor_name", visitor) === false &&
    chatBelongsToProfile(genericLegacy, o1.username, o1.uid) === false &&
    moderationActivityWriteUsernames(genericLegacy, { [visitor]: "visitor_name" }).length === 0 &&
    planModerationActivityTouches(genericLegacy).ownerUids.length === 0,
);

const { shouldScheduleModerationActivityTouch } = await loadTs(
  "src/lib/moderation/touchModerationActivity.ts",
);
const { aggregateChatsToUserFeed } = await loadTs("src/lib/moderation/classicFeed.ts");
check(
  "NO_ACTIVITY_FOR_VISITOR",
  shouldScheduleModerationActivityTouch(genericLegacy) === false &&
    aggregateChatsToUserFeed(
      [genericLegacy],
      {},
      { [visitor]: "visitor_name" },
    ).every((entry) => entry.username !== "visitor_name"),
);

check(
  "MODERN_EXACT_TARGET_RECEPTOR_STILL_BELONGS",
  chatBelongsToProfile(chatO1, o1.username, o1.uid) === true &&
    chatBelongsToProfile(
      {
        id: buildProfileAnonChatId(visitor, o1.username),
        targetUid: o1.uid,
        receptorUid: o1.uid,
        anonOwnerUid: visitor,
        initiatorUid: visitor,
      },
      o1.username,
      o1.uid,
    ) === true &&
    shouldScheduleModerationActivityTouch(chatO1) === true &&
    moderationActivityWriteUsernames(chatO1, { [o1.uid]: o1.username, [visitor]: "visitor_name" }).join() ===
      o1.username,
);

const ana = {
  id: buildProfileAnonChatId(visitor, "ana"),
  targetUsername: "ana",
  receptorUsername: "ana",
  targetUid: "uid_ana",
  anonOwnerUid: "uid_ana",
  initiatorUid: visitor,
};
const analia = {
  id: buildProfileAnonChatId(visitor, "analia"),
  targetUsername: "analia",
  receptorUsername: "analia",
  targetUid: "uid_analia",
  anonOwnerUid: "uid_analia",
  initiatorUid: visitor,
};
check(
  "ANA_NOT_ANALIA",
  exactUsernameEquals("ana", "analia") === false &&
    chatBelongsToProfile(ana, "ana", "uid_ana") === true &&
    chatBelongsToProfile(analia, "ana", "uid_ana") === false &&
    chatBelongsToProfile(ana, "analia", "uid_analia") === false &&
    chatBelongsToProfile(analia, "analia", "uid_analia") === true &&
    String(analia.id).includes("__anon_to__ana") === true,
);

let listen = initialModerationMessageListenState();
listen = beginModerationMessageListen(listen, "chatA");
const genA = listen.generation;
listen = beginModerationMessageListen(listen, "chatB");
const lateA = shouldAcceptModerationMessageSnapshot({
  state: listen,
  snapshotGeneration: genA,
  snapshotChatId: "chatA",
  collectionName: "mensajes",
});
const liveB = shouldAcceptModerationMessageSnapshot({
  state: listen,
  snapshotGeneration: listen.generation,
  snapshotChatId: "chatB",
  collectionName: "mensajes",
});
check("RAPID_A_TO_B_DISCARDS_LATE_A", lateA === false && liveB === true, {
  genA,
  genB: listen.generation,
});

const spoof = adminAuthFromHeaders({
  authorization: "",
  xAdminEmail: ADMIN_EMAIL,
});
check("HEADER_SPOOF_NO_BEARER_401", spoof.ok === false && spoof.status === 401);

let allowlist403 = false;
try {
  assertAdminAllowlist("not-admin@example.com");
} catch (error) {
  allowlist403 = Number(error.status) === 403 && String(error.message) === "forbidden";
}
check("NON_ADMIN_ALLOWLIST_403", allowlist403);

const spoofRes = await handleAdminUserChatsGet(
  new Request("http://local/api/admin/user-chats?username=ana", {
    headers: { "x-admin-email": ADMIN_EMAIL },
  }),
);
check(
  "USER_CHATS_HEADER_SPOOF_401",
  spoofRes.status === 401 &&
    spoofRes.body.ok === false &&
    spoofRes.body.error === "unauthorized" &&
    !JSON.stringify(spoofRes.body).includes(ADMIN_EMAIL),
  { status: spoofRes.status, body: spoofRes.body },
);

const mapped403 = mapAdminAuthFailure(Object.assign(new Error("forbidden"), { status: 403 }));
check("MAP_AUTH_403", mapped403.status === 403 && mapped403.error === "forbidden");

const ownerChat = {
  id: chatO1.id,
  targetUsername: o1.username,
  receptorUsername: o1.username,
  targetUid: o1.uid,
  receptorUid: o1.uid,
  anonOwnerUid: o1.uid,
  initiatorUid: visitor,
  anon: true,
};
const ownerMsg = { id: "m1", fromUid: o1.uid, text: "hola dueño" };
const visitorMsg = { id: "m2", fromUid: visitor, senderKind: "anon", text: "hola visitante" };
check(
  "OWNER_VISITOR_SIDES",
  resolveSpectatorMessageSide(ownerMsg, ownerChat, o1.username, o1.uid) === "profile" &&
    resolveSpectatorMessageSide(visitorMsg, ownerChat, o1.username, o1.uid) === "peer" &&
    resolveModerationParticipants(ownerChat, o1.username).peerIsAnon === true,
);

check(
  "TEXT_MEDIA_REPLY",
  messageDisplayText({ id: "t", text: "hola" }) === "hola" &&
    messageDisplayText({ id: "i", type: "image" }) === "📷 Foto" &&
    messageDisplayText({ id: "r", reply: "quoted" }) === "↩ Respuesta",
);

const merged = mergeModerationMessagePages(
  [
    {
      chatId: "chatA",
      collectionName: "mensajes",
      rows: [{ id: "a1", createdAtMs: 2, text: "es" }],
    },
    {
      chatId: "chatA",
      collectionName: "messages",
      rows: [{ id: "b1", createdAtMs: 1, text: "en" }],
    },
  ],
  10,
);
check(
  "BOTH_COLLECTIONS_EXACT_PATH",
  MODERATION_MESSAGE_COLLECTIONS.join(",") === "mensajes,messages" &&
    exactMessageCollectionName("mensajes") === "mensajes" &&
    exactMessageCollectionName("messages") === "messages" &&
    exactMessageCollectionName("msgs") === "" &&
    merged.length === 2 &&
    merged[0].collectionName === "messages" &&
    merged[1].collectionName === "mensajes" &&
    merged[0].collectionPath === moderationMessagePath("chatA", "messages", "b1") &&
    merged[1].collectionPath === moderationMessagePath("chatA", "mensajes", "a1"),
);

const fetchSrc = fs.readFileSync(path.join(root, "src/lib/moderation/fetchUserChats.ts"), "utf8");
const routeSrc = fs.readFileSync(path.join(root, "src/lib/admin/userChatsRoute.ts"), "utf8");
const nextRouteSrc = fs.readFileSync(path.join(root, "src/app/api/admin/user-chats/route.ts"), "utf8");
const verifySrc = fs.readFileSync(path.join(root, "src/lib/admin/verifyAdminRequest.ts"), "utf8");
const hookSrc = fs.readFileSync(path.join(root, "src/hooks/useSpectatorTheater.ts"), "utf8");
const feedSrc = fs.readFileSync(path.join(root, "src/hooks/useClassicModerationFeed.ts"), "utf8");
const legacySrc = fs.readFileSync(path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"), "utf8");
const touchSrc = fs.readFileSync(path.join(root, "src/lib/moderation/touchModerationActivity.ts"), "utf8");
const classicSrc = fs.readFileSync(path.join(root, "src/lib/moderation/classicFeed.ts"), "utf8");
check(
  "FETCH_NO_INITIATOR_QUERY_USES_ADMIN_SDK",
  !fetchSrc.includes("initiatorUid") &&
    !fetchSrc.includes("anonOwnerUid") &&
    fetchSrc.includes("getRepairAdminDb") &&
    fetchSrc.includes("MODERATION_OWNER_UID_FIELDS") &&
    fetchSrc.includes("fetchViaAdmin") &&
    fetchSrc.includes("fetchViaRest") &&
    fetchSrc.includes("runFilteredCollectionQueryAll") &&
    !fetchSrc.includes(".includes(marker)"),
);
check(
  "USER_CHATS_BEARER_NO_HEADER_EMAIL",
  routeSrc.includes("verifyAdminIdToken") &&
    nextRouteSrc.includes("handleAdminUserChatsGet") &&
    !routeSrc.includes("getAdminEmailFromRequest") &&
    !routeSrc.includes("x-admin-email") &&
    !nextRouteSrc.includes("getAdminEmailFromRequest") &&
    feedSrc.includes("Authorization") &&
    feedSrc.includes("getIdToken") &&
    !/user-chats[\s\S]{0,400}x-admin-email/.test(feedSrc),
);
check(
  "ADMIN_VERIFY_ADMIN_SDK_FIRST_REVOKE",
  /export async function verifyAdminIdToken[\s\S]*verifyIdTokenWithAdminSdk[\s\S]*assertAdminAllowlist/.test(
    verifySrc,
  ) &&
    verifySrc.includes("verifyIdToken(token, true)") &&
    verifySrc.includes("verifyIdTokenViaIdentityToolkit") &&
    /Hard auth failures stay hard/.test(verifySrc),
);
check(
  "LISTENER_GENERATION_BOTH_COLLECTIONS",
  hookSrc.includes("beginModerationMessageListen") &&
    hookSrc.includes("abortModerationMessageListen") &&
    hookSrc.includes("shouldAcceptModerationMessageSnapshot") &&
    hookSrc.includes("MODERATION_MESSAGE_COLLECTIONS"),
);
check(
  "LEGACY_NOTIFY_NOT_SENDER_AS_OWNER",
  !legacySrc.includes("anonOwnerUid: author.senderAuthUid") &&
    !legacySrc.includes("initiatorUid: author.senderAuthUid") &&
    !legacySrc.includes("anonOwnerUid ?? currentUid") &&
    !legacySrc.includes("initiatorUid ?? currentUid"),
);
check(
  "TOUCH_AND_FEED_NO_VISITOR_UID_INDEX",
  !touchSrc.includes("chat.initiatorUid") &&
    !touchSrc.includes("chat.anonOwnerUid") &&
    touchSrc.includes("canonicalOwnerUids") &&
    !classicSrc.includes("chat.initiatorUid") &&
    !classicSrc.includes("chat.anonOwnerUid"),
);

const report = {
  gate: "MODERATION_CHAT_ISOLATION",
  pass: checks.every((item) => item.pass),
  checks,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
