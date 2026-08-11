/**
 * Source-guard: notifications live in the owner ⋮ menu, not as a loose settings block.
 * Does NOT prove physical Android E2E. Usage: node scripts/profile-notifications-menu.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return "";
  const abs = path.join(root, "src", specifier.slice(2));
  const candidates = [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`, path.join(abs, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return "";
}

if (typeof module.registerHooks === "function") {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const mapped = resolveAlias(specifier);
      if (mapped) return { url: mapped, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

const menu = read("src/components/profile/ProfileClaimHistoryMenu.tsx");
assert.match(menu, /data-profile-option="notifications"/);
assert.match(menu, /<Bell /);
assert.match(menu, /notificationsOpen/);
assert.match(menu, /variant="panel"/);
assert.match(menu, /createPortal/);
assert.match(menu, /ChatNotificationSetting/);
assert.match(menu, /data-chat-notification-panel/);
assert.match(menu, /z-\[1000002\]/);

const settings = read("src/app/settings/page.tsx");
assert.match(settings, /ProfileClaimHistoryMenu/);
assert.doesNotMatch(
  settings,
  /ChatNotificationSetting/,
  "settings page must not render a loose notification block",
);

const classicEdit = read("src/app/settings/edit/components/ClassicEditProfilePage.tsx");
const modernEdit = read("src/app/settings/edit/components/ModernEditProfilePage.tsx");
assert.doesNotMatch(classicEdit, /ChatNotificationSetting/);
assert.doesNotMatch(modernEdit, /ChatNotificationSetting/);

const modernProfile = read("src/components/modern/ModernPublicProfile.tsx");
assert.match(modernProfile, /ProfileClaimHistoryMenu/);

const panel = read("src/components/chat/ChatNotificationSetting.tsx");
assert.match(panel, /variant === "panel"/);
assert.match(panel, /chat_notifications_disable_cta/);
assert.match(panel, /deleteCurrentDeviceFcmToken/);
assert.match(panel, /enableNativeChatPush/);
assert.match(panel, /onPointerUp/);
assert.match(panel, /chat_notifications_disable_cta/);
assert.match(panel, /openNativeNotificationSettings/);
assert.match(panel, /regForUid.uid === uid \? regForUid.state : null/);
assert.match(panel, /Boolean\(uid\) && tokenForUid.uid === uid/);
assert.match(panel, /if \(cancelled\) return/);
assert.match(panel, /completeChatNotificationPrompt\(false\)/);

const prompt = read("src/components/chat/ChatNotificationPrompt.tsx");
assert.match(prompt, /isNotificationProfileReady/);
assert.match(prompt, /enableNativeChatPush/);
assert.match(prompt, /reason !== "not_native"/);
assert.match(prompt, /resetChatNotificationPromptOnLogout/);
assert.match(prompt, /chatNotificationPromptOpen/);
assert.doesNotMatch(prompt, /registerNativePushIfEnabled/);
assert.match(prompt, /z-\[1000000\]/);
assert.match(prompt, /completeChatNotificationPrompt\(false\)/);

const fcmSrc = read("src/lib/chat/fcmPush.ts");
assert.match(fcmSrc, /enableInFlightByUid/);
assert.match(fcmSrc, /skipAutoEnable/);
assert.match(fcmSrc, /reconcilePendingForEnable/);
assert.doesNotMatch(fcmSrc, /export function shouldFlushPendingUnregister/);

const install = await import(
  pathToFileURL(path.join(root, "src/lib/chat/fcmInstallation.ts")).href
);
const pipeline = await import(
  pathToFileURL(path.join(root, "src/lib/chat/fcmEnablePipeline.ts")).href
);
assert.equal(
  install.shouldFlushPendingUnregister({
    pendingUid: "uid_a",
    currentUid: "uid_a",
    pendingToken: "old_token",
    currentToken: "new_token",
  }),
  true,
);
assert.equal(
  install.shouldFlushPendingUnregister({
    pendingUid: "uid_a",
    currentUid: "uid_a",
    pendingToken: "same",
    currentToken: "same",
  }),
  false,
  "same token does not flush",
);
let flushedPrefsOff = false;
const flushed = await pipeline.flushPendingUnlocked(
  {
    liveUid: () => "uid_a",
    readPending: () => ({
      uid: "uid_a",
      token: "old_token",
      installationId: "inst_1",
      proof: "p",
    }),
    clearPending: () => undefined,
    flushCall: async () => {
      flushedPrefsOff = true;
    },
    registerCall: async () => {
      throw new Error("register_should_not_run_on_prefs_off_flush");
    },
  },
  {
    currentUid: "uid_a",
    installationId: "inst_1",
    currentToken: "new_token",
    proof: "p",
  },
);
assert.equal(flushed, true);
assert.equal(flushedPrefsOff, true, "prefs-off flush still calls productive helper");
assert.match(fcmSrc, /PushNotifications.unregister/);
assert.match(fcmSrc, /readInstallationProof/);
assert.match(fcmSrc, /withInstallationLock/);
assert.match(fcmSrc, /liveAuthUid\(\) !== cleanUid/);
assert.match(fcmSrc, /clearPendingIfSameInstallation/);
assert.match(
  fcmSrc,
  /await flushPendingFcmUnregister\(\);\s*\n\s*if \(areChatNotificationsEnabled\(\)\)/,
);
assert.doesNotMatch(fcmSrc, /void upsertFcmTokenForUser\(uid, token\)/);

const perms = read("src/lib/chat/chatNotifications.ts");
assert.match(perms, /PushNotifications/);
assert.match(perms, /requestPermissions/);

const fcm = read("src/lib/chat/fcmPush.ts");
assert.match(fcm, /upsertFcmTokenForUser/);
assert.match(fcm, /installationId/);
assert.match(fcm, /unregisterFcmToken/);
assert.match(fcm, /pushNotificationActionPerformed/);
assert.match(fcm, /\/chat\/\$\{encodeURIComponent/);

const logout = read("src/lib/auth/logout.ts");
assert.match(logout, /deleteCurrentDeviceFcmToken/);
assert.match(logout, /clearCachedViewerIdentity/);

const manifest = read("android/app/src/main/AndroidManifest.xml");
assert.match(manifest, /android.permission.POST_NOTIFICATIONS/);

const authorship = read("src/lib/chat/profileAnonMessageAuthor.ts");
assert.match(authorship, /export function profileAuthUid/);

const routeKind = read("src/lib/navigation/routeKind.ts");
assert.match(routeKind, /startsWith\("\/chat\/"\)/);

const nav = read("src/components/navigation/AppNavigation.tsx");
assert.match(nav, /isChatThreadRoute/);

console.log(
  JSON.stringify(
    {
      gate: "PROFILE_NOTIFICATIONS_MENU",
      pass: true,
      note: "Source-only. Physical two-account FG/BG/killed E2E still required.",
    },
    null,
    2,
  ),
);
