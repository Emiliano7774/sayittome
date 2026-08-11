/**
 * Source-guard: notifications live in the owner ⋮ menu, not as a loose settings block.
 * Does NOT prove physical Android E2E. Usage: node scripts/profile-notifications-menu.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

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

const prompt = read("src/components/chat/ChatNotificationPrompt.tsx");
assert.match(prompt, /registerNativePushIfEnabled/);
assert.match(prompt, /z-\[1000000\]/);

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
