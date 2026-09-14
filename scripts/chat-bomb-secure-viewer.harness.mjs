/**
 * CHAT_BOMB_SECURE_VIEWER
 * Web close visible when secure; Android Back + FLAG_SECURE; cleanup; no URL proxy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const chat = fs.readFileSync(path.join(root, "src/components/chat/ProfileAnonChat.tsx"), "utf8");
const viewer = fs.readFileSync(path.join(root, "src/components/chat/media/FullscreenMedia.tsx"), "utf8");
const back = fs.readFileSync(path.join(root, "src/lib/navigation/nativeBack.ts"), "utf8");
const android = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/sayittome/app/MainActivity.java"),
  "utf8",
);
const proxy = fs.readFileSync(path.join(root, "src/app/api/view-once/media/route.ts"), "utf8");
const deliverSrc = fs.readFileSync(path.join(root, "src/lib/media/viewOnceMediaDeliver.ts"), "utf8");
const claimFn = fs.readFileSync(path.join(root, "functions/src/viewOnceClaim.ts"), "utf8");

// (1) Web/PWA: close control remains visible+accessible even when secure=true.
assert.match(viewer, /aria-label="Cerrar"/);
assert.match(viewer, /onClick=\{onClose\}/);
assert.doesNotMatch(viewer, /\{!secure\s*\?\s*\(/);
assert.match(viewer, /secure\s*=\s*false/);

// Android Back still closes secure bomb and clears FLAG_SECURE path.
assert.match(back, /sayittome:close-secure-bomb/);
assert.match(android, /FLAG_SECURE/);
assert.match(android, /SayItToMeSecureScreen/);
assert.match(chat, /setSecureBombScreen\(false\)/);
assert.match(chat, /leaveSecureBombMode/);

// (2) Media endpoint is claim-bound — not an open mediaUrl proxy.
assert.match(proxy, /executeViewOnceMediaDelivery/);
assert.match(proxy, /verifyFirebaseIdTokenAllowingAnonymous/);
assert.doesNotMatch(proxy, /body\.mediaUrl/);
assert.match(proxy, /chatId/);
assert.match(proxy, /messageId/);
assert.doesNotMatch(proxy, /\.catch\(\(\)\s*=>\s*undefined\)/);
assert.match(deliverSrc, /reserveViewOnceMediaGrant/);
assert.match(deliverSrc, /restoreViewOnceMediaGrant/);
assert.match(deliverSrc, /finalizeViewOnceMediaGrant/);
assert.match(deliverSrc, /resolveViewOnceGrantRestoreExpiry/);
assert.match(deliverSrc, /isViewOnceReservationOwner/);
assert.match(deliverSrc, /deliveryReservationId/);
assert.match(deliverSrc, /decideViewOnceMediaAccess/);
assert.match(claimFn, /deliveryReservationId:\s*FieldValue\.delete\(\)/);
assert.match(proxy, /loadFirebaseAdminFirestore/);
assert.match(proxy, /firebaseAdminNative/);
assert.doesNotMatch(proxy, /import\s*\(\s*["']firebase-admin(?:\/[^"']*)?["']\s*\)/);
assert.match(claimFn, /viewOnceDeliveryDocFields/);
assert.match(claimFn, /deliveryUid/);
assert.match(claimFn, /deliveryExpiresAtMs/);
assert.doesNotMatch(claimFn, /mediaUrl:\s*String\(decision\.mediaUrl/);
assert.match(chat, /getIdToken\(/);
assert.match(chat, /Authorization:\s*`Bearer \$\{idToken\}`/);
assert.match(chat, /chatId:\s*claimChatId/);
assert.match(chat, /messageId:\s*message\.id/);
assert.doesNotMatch(chat, /JSON\.stringify\(\{\s*mediaUrl:\s*claimed\.mediaUrl/);

// (3) Cleanup on close, route/chat change, error, unmount.
assert.match(chat, /function revokeSecureBombObjectUrl/);
assert.match(chat, /URL\.revokeObjectURL/);
assert.match(chat, /function leaveSecureBombMode/);
assert.match(chat, /function closeFullscreenMedia/);
assert.match(chat, /sayittome:close-secure-bomb/);
assert.match(chat, /isChatThreadRoute\(pathname\)[\s\S]{0,240}closeFullscreenMedia/);
assert.match(chat, /\[chatId\]/);
assert.match(chat, /secureBombOpenRef\.current\) leaveSecureBombMode\(\)/);
assert.match(chat, /setSecureBombScreen\(false\)/);
assert.match(chat, /revokeSecureBombObjectUrl\(\)/);

// Secure viewer + video still wired.
assert.match(chat, /fetch\("\/api\/view-once\/media"/);
assert.match(chat, /URL\.createObjectURL\(mediaBlob\)/);
assert.match(chat, /setSecureBombScreen\(true\)/);
assert.match(chat, /sayittome-bomb-secure-open/);
assert.match(viewer, /controls=\{!secure\}/);
assert.match(viewer, /disablePictureInPicture=\{secure\}/);
assert.match(viewer, /nodownload/);

const access = await import(
  pathToFileURL(path.join(root, "src/lib/media/viewOnceMediaAccess.ts")).href
);

const now = 1_700_000_000_000;
const goodUrl =
  "https://firebasestorage.googleapis.com/v0/b/sayittome-app.firebasestorage.app/o/chats%2Fc1%2Fbomb.jpg?alt=media";

const unauth = access.decideViewOnceMediaAccess({
  uid: "",
  body: { chatId: "c1", messageId: "m1" },
  delivery: null,
  nowMs: now,
});
assert.equal(unauth.status, "DENIED");
assert.equal(unauth.reason, "unauthenticated");

const proxyAbuse = access.decideViewOnceMediaAccess({
  uid: "member",
  body: { chatId: "c1", messageId: "m1", mediaUrl: goodUrl },
  delivery: {
    mediaUrl: goodUrl,
    deliveryUid: "member",
    deliveryExpiresAtMs: now + 60_000,
  },
  nowMs: now,
});
assert.equal(proxyAbuse.status, "DENIED");
assert.equal(proxyAbuse.reason, "proxy_forbidden");

const foreign = access.decideViewOnceMediaAccess({
  uid: "intruder",
  body: { chatId: "c1", messageId: "m1" },
  delivery: {
    mediaUrl: goodUrl,
    deliveryUid: "member",
    deliveryExpiresAtMs: now + 60_000,
  },
  nowMs: now,
});
assert.equal(foreign.status, "DENIED");
assert.equal(foreign.reason, "not_member_claim");

const member = access.decideViewOnceMediaAccess({
  uid: "member",
  body: { chatId: "c1", messageId: "m1" },
  delivery: {
    mediaUrl: goodUrl,
    deliveryUid: "member",
    deliveryExpiresAtMs: now + 60_000,
    deliveryConsumeSecret: true,
  },
  nowMs: now,
});
assert.equal(member.status, "ALLOWED");
assert.equal(member.mediaUrl, goodUrl);
assert.equal(member.consumeSecret, true);

console.log(
  JSON.stringify(
    {
      gate: "CHAT_BOMB_SECURE_VIEWER",
      pass: true,
      checks: {
        web_close: "ALLOWED",
        auth_foreign: "DENIED",
        member_claim: "ALLOWED",
        cleanup: "ALLOWED",
      },
    },
    null,
    2,
  ),
);
