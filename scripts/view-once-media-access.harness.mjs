/**
 * VIEW_ONCE_MEDIA_ACCESS
 * Auth/ajeno DENIED, member claim ALLOWED, mediaUrl proxy forbidden.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const access = await import(
  pathToFileURL(path.join(root, "src/lib/media/viewOnceMediaAccess.ts")).href
);

const now = 1_700_000_000_000;
const goodUrl =
  "https://firebasestorage.googleapis.com/v0/b/sayittome-app.firebasestorage.app/o/chats%2Fc1%2Fbomb.jpg?alt=media";

assert.equal(access.isAllowedBombMediaUrl(goodUrl), true);
assert.equal(access.isAllowedBombMediaUrl("https://evil.example/x.jpg"), false);

const grant = access.viewOnceDeliveryDocFields({
  uid: "member",
  mediaUrl: goodUrl,
  consumeSecret: false,
  nowMs: now,
});
assert.equal(grant.deliveryUid, "member");
assert.equal(grant.deliveryExpiresAtMs, now + access.VIEW_ONCE_DELIVERY_TTL_MS);

const deniedUnauth = access.decideViewOnceMediaAccess({
  uid: "",
  body: { chatId: "c1", messageId: "m1" },
  delivery: grant,
  nowMs: now,
});
assert.equal(deniedUnauth.status, "DENIED");

const deniedForeign = access.decideViewOnceMediaAccess({
  uid: "other",
  body: { chatId: "c1", messageId: "m1" },
  delivery: grant,
  nowMs: now,
});
assert.equal(deniedForeign.status, "DENIED");
assert.equal(deniedForeign.reason, "not_member_claim");

const deniedProxy = access.decideViewOnceMediaAccess({
  uid: "member",
  body: { chatId: "c1", messageId: "m1", mediaUrl: goodUrl },
  delivery: grant,
  nowMs: now,
});
assert.equal(deniedProxy.status, "DENIED");
assert.equal(deniedProxy.reason, "proxy_forbidden");

const allowed = access.decideViewOnceMediaAccess({
  uid: "member",
  body: { chatId: "c1", messageId: "m1" },
  delivery: grant,
  nowMs: now,
});
assert.equal(allowed.status, "ALLOWED");

console.log(
  JSON.stringify(
    {
      gate: "VIEW_ONCE_MEDIA_ACCESS",
      pass: true,
      results: {
        auth_ajeno: "DENIED",
        miembro: "ALLOWED",
        proxy_mediaUrl: "DENIED",
      },
    },
    null,
    2,
  ),
);
