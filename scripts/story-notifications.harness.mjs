/**
 * Story notification policy + MAD + copy + hrefs.
 *   node scripts/story-notifications.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyNotificationPolicy.ts")).href
);

assert.deepEqual(policy.defaultStoryNotifPrefs(), { likes: true, followingUploads: true });
assert.equal(
  policy.pairAllowsStoryNotif("likes", { likes: true, followingUploads: true }, null, null, null),
  true,
);
assert.equal(
  policy.pairAllowsStoryNotif(
    "likes",
    { likes: false, followingUploads: true },
    { likes: true, followingUploads: true },
  ),
  false,
  "one side off is mutual assured destruction",
);
assert.equal(
  policy.pairAllowsStoryNotif(
    "followingUploads",
    { likes: true, followingUploads: false },
    { likes: true, followingUploads: true },
  ),
  false,
  "turning off follow-story alerts is mutual",
);
assert.equal(
  policy.pairAllowsStoryNotif(
    "followingUploads",
    { likes: true, followingUploads: true },
    { likes: true, followingUploads: true },
  ),
  true,
);

assert.equal(policy.isAnonymousStoryLiker({ signInProvider: "anonymous", username: "x" }), true);
assert.equal(policy.isAnonymousStoryLiker({ username: "emiliano501" }), false);

const profileLike = policy.storyLikeNotificationCopy({
  anonymous: false,
  likerUsername: "Emiliano501",
});
assert.equal(profileLike.title, "Emiliano501 te likeó");
assert.equal(policy.storyLikeOpenHref({ anonymous: false, likerUsername: "Emiliano501" }), "/u/Emiliano501");

const anonLike = policy.storyLikeNotificationCopy({ anonymous: true, likerUsername: "" });
assert.equal(anonLike.title, "Recibiste un like");
assert.equal(policy.storyLikeOpenHref({ anonymous: true, likerUsername: "hidden" }), "/stories");

assert.equal(
  policy.storyUploadOpenHref("owner1", "story9"),
  "/stories/owner1?story=story9",
);
assert.equal(policy.sanitizeStoryNotificationHref("https://evil.test"), "");
assert.equal(policy.sanitizeStoryNotificationHref("//evil.test"), "");
assert.ok(policy.isStoryNotificationHref("/stories/abc?story=1"));

const fnSrc = fs.readFileSync(path.join(root, "functions/src/storyLike.ts"), "utf8");
assert.match(fnSrc, /notifyStoryLike/);
assert.match(fnSrc, /storyPairAllows/);
const created = fs.readFileSync(path.join(root, "functions/src/storyCreated.ts"), "utf8");
assert.match(created, /followingUploads/);
assert.match(created, /seguidores/);
assert.match(created, /siguiendo/);
const peerMenu = fs.readFileSync(
  path.join(root, "src/components/profile/ProfilePeerOptionsMenu.tsx"),
  "utf8",
);
assert.doesNotMatch(peerMenu, /StoryNotificationSettings/);
assert.doesNotMatch(peerMenu, /story-notifications/);
const ownMenu = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileClaimHistoryMenu.tsx"),
  "utf8",
);
assert.match(ownMenu, /StoryNotificationSettings mode="global"/);
assert.match(
  fs.readFileSync(path.join(root, "src/components/stories/StoryNotificationSettings.tsx"), "utf8"),
  /data-story-notif-explain/,
);
assert.match(
  fs.readFileSync(path.join(root, "src/lib/i18n/messages.ts"), "utf8"),
  /ellos tampoco se enteran cuando subís/,
);
const push = fs.readFileSync(path.join(root, "functions/src/storyPush.ts"), "utf8");
assert.match(push, /STORY_NOTIF_COLOR/);
assert.match(push, /ic_stat_story_like/);
assert.match(push, /ic_stat_notify/);
assert.match(push, /STORY_NOTIF_CHANNEL_ID/);
assert.match(push, /notification:\s*\{\s*title/);
assert.match(push, /channelId: STORY_NOTIF_CHANNEL_ID/);
assert.match(push, /defaultSound:\s*true/);
assert.doesNotMatch(push, /whip/);
const local = fs.readFileSync(path.join(root, "src/lib/stories/storyLocalNotification.ts"), "utf8");
assert.match(local, /ensureStoryNotificationChannel/);
assert.match(local, /androidHasNativeStoryBanner/);
assert.match(local, /ic_stat_notify/);
const policySrc = fs.readFileSync(
  path.join(root, "functions/src/storyNotificationPolicy.ts"),
  "utf8",
);
assert.match(policySrc, /#E879F9/);
assert.match(policySrc, /stories-v2/);
assert.match(push, /loadPrefs\(actor, STORY_NOTIF_GLOBAL_DOC\)/);
assert.doesNotMatch(push, /loadPrefs\(actor, peer\)/);

const prompt = fs.readFileSync(
  path.join(root, "src/components/chat/ChatNotificationPrompt.tsx"),
  "utf8",
);
assert.match(prompt, /enableStoryNotificationPack/);
const fcm = fs.readFileSync(path.join(root, "src/lib/chat/fcmPush.ts"), "utf8");
assert.match(fcm, /openStoryNotificationHref/);
assert.match(fcm, /ensureStoryNotificationChannel/);
assert.match(fcm, /presentStoryForegroundNotification/);
assert.match(fcm, /story_like/);
const androidFcm = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/sayittome/app/ChatExpandableMessagingService.java"),
  "utf8",
);
assert.match(androidFcm, /shouldRenderStoryNotification/);
assert.match(androidFcm, /renderStoryNotification/);
assert.match(androidFcm, /ic_stat_story_like/);
assert.match(androidFcm, /0xFFE879F9/);
const storyFn =
  androidFcm.split("private void renderStoryNotification")[1]?.split("private Bitmap")[0] || "";
assert.match(storyFn, /ic_stat_story_like/);
assert.doesNotMatch(storyFn, /R\.raw\.whip/);

console.log("PASS story-notifications");
