/**
 * ADMIN_USER_CHATS_NO_MASKED_ERROR
 * Username %, auth spoof, failure codes must never become pink literal "error".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const param = await import(
  pathToFileURL(path.join(root, "src/lib/admin/adminUsernameParam.ts")).href
);
const { handleAdminUserChatsGet } = await import(
  pathToFileURL(path.join(root, "src/lib/admin/userChatsRoute.ts")).href
);
const { ADMIN_EMAIL } = await import(
  pathToFileURL(path.join(root, "src/lib/admin/isAdmin.ts")).href
);

// Bare % must survive (no URIError → "error").
assert.equal(param.parseAdminUsernameQueryParam("user%name"), "user%name");
assert.equal(param.parseAdminUsernameQueryParam("100%"), "100%");
assert.equal(param.parseAdminUsernameQueryParam("  ana  "), "ana");
assert.equal(param.parseAdminUsernameQueryParam("caf%C3%A9"), "caf%C3%A9");

// URLSearchParams already decodes %20 / unicode once.
const url = new URL("http://local/api/admin/user-chats?username=foo%25bar");
assert.equal(param.parseAdminUsernameQueryParam(url.searchParams.get("username")), "foo%bar");

const unicodeUrl = new URL(
  `http://local/api/admin/user-chats?username=${encodeURIComponent("niño")}`,
);
assert.equal(param.parseAdminUsernameQueryParam(unicodeUrl.searchParams.get("username")), "niño");

assert.equal(
  param.mapAdminUserChatsFailure(Object.assign(new Error("username_not_unique"), { status: 409 }))
    .error,
  "username_not_unique",
);
assert.equal(
  param.mapAdminUserChatsFailure(Object.assign(new Error("admin_sdk_unavailable"), { status: 503 }))
    .error,
  "admin_sdk_unavailable",
);
assert.notEqual(
  param.mapAdminUserChatsFailure(new Error("index_required")).error,
  "error",
);
assert.notEqual(param.adminUserChatsErrorMessage("error"), "error");
assert.match(param.adminUserChatsErrorMessage("unauthorized"), /Sesión/);

// Spoof header alone → unauthorized (not pink "error").
const spoof = await handleAdminUserChatsGet(
  new Request("http://local/api/admin/user-chats?username=ana", {
    headers: { "x-admin-email": ADMIN_EMAIL },
  }),
);
assert.equal(spoof.status, 401);
assert.equal(spoof.body.error, "unauthorized");
assert.notEqual(spoof.body.error, "error");

// Username with % reaches handler without throwing masked "error".
const pct = await handleAdminUserChatsGet(
  new Request("http://local/api/admin/user-chats?username=100%25", {
    headers: { "x-admin-email": ADMIN_EMAIL },
  }),
);
assert.equal(pct.status, 401);
assert.equal(pct.body.error, "unauthorized");

const routeSrc = fs.readFileSync(path.join(root, "src/lib/admin/userChatsRoute.ts"), "utf8");
assert.match(routeSrc, /parseAdminUsernameQueryParam/);
assert.doesNotMatch(routeSrc, /decodeURIComponent/);
assert.doesNotMatch(routeSrc, /error: "error"/);

const nextRoute = fs.readFileSync(
  path.join(root, "src/app/api/admin/user-chats/route.ts"),
  "utf8",
);
assert.match(nextRoute, /mapAdminUserChatsFailure/);
assert.doesNotMatch(nextRoute, /mapAdminAuthFailure/);

const feedSrc = fs.readFileSync(
  path.join(root, "src/hooks/useClassicModerationFeed.ts"),
  "utf8",
);
assert.match(feedSrc, /authStateReady/);
assert.match(feedSrc, /adminUserChatsErrorMessage/);
assert.match(feedSrc, /retry:/);

const viewSrc = fs.readFileSync(
  path.join(root, "src/components/admin/review/AdminChatReviewView.tsx"),
  "utf8",
);
assert.match(viewSrc, /data-admin-user-chats-error/);
assert.match(viewSrc, /Reintentar/);

const workspaceSrc = fs.readFileSync(
  path.join(root, "src/components/admin/AdminModerationWorkspace.tsx"),
  "utf8",
);
assert.match(workspaceSrc, /reports|fake_profiles|claims|chats|stories|antiacoso/);

console.log(
  JSON.stringify(
    {
      gate: "ADMIN_USER_CHATS_NO_MASKED_ERROR",
      pass: true,
      percentUsernameSafe: true,
      noLiteralErrorMask: true,
    },
    null,
    2,
  ),
);
