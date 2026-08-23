/**
 * CHAT_OFFICIAL_PROFILE_LINK
 * Exact https://sytm.me/@username only. Sender+receiver share the same parser.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const profileChat = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const messageText = fs.readFileSync(
  path.join(root, "src/components/chat/ChatMessageText.tsx"),
  "utf8",
);
const rowSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ChatVerifiedProfileLinkCard.tsx"),
  "utf8",
);
const legacySrc = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);

assert.match(profileChat, /decideOfficialProfileLinkRender/);
assert.match(profileChat, /ChatVerifiedProfileLinkCard/);
assert.match(profileChat, /ChatMessageReceipt/);
assert.ok(
  profileChat.indexOf("ChatVerifiedProfileLinkCard") <
    profileChat.indexOf("<ChatMessageReceipt"),
  "verified row must sit between bubble and receipts",
);
assert.match(messageText, /data-official-profile-link-url/);
assert.match(messageText, /rememberChatBeforeOfficialProfileOpen/);
assert.match(messageText, /min-h-11/);
assert.match(messageText, /break-all/);
assert.doesNotMatch(messageText, /dangerouslySetInnerHTML/);
assert.match(rowSrc, /data-official-profile-link-row/);
assert.match(rowSrc, /min-h-11/);
assert.match(rowSrc, /chat_verified_link_badge/);
assert.match(legacySrc, /decideOfficialProfileLinkRender/);
assert.match(legacySrc, /ChatVerifiedProfileLinkCard/);

const link = await import(
  pathToFileURL(path.join(root, "src/lib/profile/verifiedLink.ts")).href
);
const username = await import(
  pathToFileURL(path.join(root, "src/lib/profile/username.ts")).href
);

assert.equal(link.VERIFIED_PROFILE_PUBLIC_HOST, "sytm.me");
assert.equal(link.OFFICIAL_PROFILE_LINK_MIN_HIT_PX, 44);
assert.deepEqual(link.chatOfficialProfileLinkSlots(), [
  "bubble-url",
  "verified-row",
  "receipts",
]);
assert.equal(
  username.normalizeUsername("Emiliano"),
  link.normalizeVerifiedProfileUsername("Emiliano"),
);

function accept(text, slug, href) {
  const sender = link.parseExactOfficialProfileLinkMessage(text);
  const receiver = link.parseVerifiedProfileLinkInText(text);
  assert.ok(sender, `sender must accept ${text}`);
  assert.deepEqual(receiver, sender, "sender and receiver share the same parse");
  assert.equal(sender.username, slug);
  assert.equal(sender.profileHref, href);
}

function reject(text) {
  assert.equal(link.parseExactOfficialProfileLinkMessage(text), null, `must reject ${text}`);
}

accept("https://sytm.me/@sex", "sex", "/u/sex");
accept("https://sytm.me/@emiliano", "emiliano", "/u/emiliano");
accept("https://sytm.me/@Emiliano", "emiliano", "/u/emiliano");
accept("https://sytm.me/@EMILIANO/", "emiliano", "/u/emiliano");
accept("  HTTPS://SYTM.ME/@navbench  ", "navbench", "/u/navbench");
accept("https://sytm.me/@foo.bar_1", "foo.bar_1", "/u/foo.bar_1");

const encoded = link.parseExactOfficialProfileLinkMessage("https://sytm.me/@Ada_99");
assert.equal(encoded.profileHref, `/u/${encodeURIComponent("ada_99")}`);

reject("http://sytm.me/@emiliano");
reject("https://sytm.me/@emiliano?ref=1");
reject("https://sytm.me/@emiliano#x");
reject("https://sytm.me:443/@emiliano");
reject("https://sytm.me:8080/@emiliano");
reject("https://evil.sytm.me/@emiliano");
reject("https://sytm.me.evil.com/@emiliano");
reject("https://www.sytm.me/@emiliano");
reject("https://user:pass@sytm.me/@emiliano");
reject("https://user@sytm.me/@emiliano");
reject("mira https://sytm.me/@emiliano");
reject("https://sytm.me/@emiliano porfa");
reject("https://sytm.me/u/emiliano");
reject("https://sytm.me/@emiliano/extra");
reject("sytm.me/@emiliano");
reject("Perfil verificado");
reject("<a href=\"https://sytm.me/@emiliano\">verificado</a>");

window.location.pathname = "/chat/thread-1";
link.rememberChatBeforeOfficialProfileOpen();
assert.equal(
  window.sessionStorage.getItem("sayittome-profile-return"),
  "/chat/thread-1",
);

console.log(JSON.stringify({ gate: "CHAT_OFFICIAL_PROFILE_LINK", pass: true }, null, 2));
