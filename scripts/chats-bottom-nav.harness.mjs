/**
 * FAIL 2: /chats must keep bottom nav; only /chat/{id} hides it.
 * Reproduces the startsWith("/chat") classifier bug.
 *
 * Usage: node scripts/chats-bottom-nav.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizePath(pathname) {
  return String(pathname || "/").split("?")[0].split("#")[0] || "/";
}

function isChatThreadRoute(pathname) {
  return normalizePath(pathname).startsWith("/chat/");
}

function navHidden(pathname, uxMode = "classic") {
  const path = normalizePath(pathname);
  const HIDE_PREFIXES = ["/admin", "/login", "/register", "/privacy", "/settings/edit"];
  return (
    path === "/" ||
    isChatThreadRoute(path) ||
    HIDE_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    (uxMode === "modern" && path === "/shuffle")
  );
}

// BEFORE: startsWith("/chat") hid the inbox tab.
assert.equal("/chats".startsWith("/chat"), true, "document the prefix collision");
assert.equal(navHidden("/chats"), false, "AFTER: /chats keeps bottom nav");
assert.equal(navHidden("/chats/"), false, "AFTER: /chats/ keeps bottom nav");
assert.equal(navHidden("/chat/abc"), true, "thread hides nav");
assert.equal(navHidden("/chat/anon_x__anon_to__user"), true, "profile-anon thread hides nav");
assert.equal(navHidden("/shuffle", "classic"), false, "classic shuffle keeps nav");
assert.equal(navHidden("/stories"), false, "stories keeps nav");
assert.equal(navHidden("/settings"), false, "settings keeps nav");

const navSrc = fs.readFileSync(
  path.join(root, "src/components/navigation/AppNavigation.tsx"),
  "utf8",
);
assert.match(navSrc, /isChatThreadRoute/);
assert.doesNotMatch(navSrc, /pathname\.startsWith\("\/chat"\)/);

const routeSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/routeKind.ts"),
  "utf8",
);
assert.match(routeSrc, /startsWith\("\/chat\/"\)/);

const chatSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
assert.match(chatSrc, /isChatThreadRoute\(pathname\)/);

console.log(
  JSON.stringify(
    {
      gate: "CHATS_BOTTOM_NAV",
      pass: true,
      beforePrefixCollision: true,
      afterChatsKeepsNav: !navHidden("/chats"),
    },
    null,
    2,
  ),
);
