export type StoryNotifChannel = "likes" | "followingUploads";

export type StoryNotifPrefs = {
  likes: boolean;
  followingUploads: boolean;
};

export const STORY_NOTIF_CHANNELS: StoryNotifChannel[] = ["likes", "followingUploads"];
export const STORY_NOTIF_GLOBAL_DOC = "_global";
export const STORY_NOTIF_COLOR = "#E879F9";
export const STORY_NOTIF_CHANNEL_ID = "stories-v2";

export function defaultStoryNotifPrefs(): StoryNotifPrefs {
  return { likes: true, followingUploads: true };
}

export function normalizeStoryNotifPrefs(value: unknown): StoryNotifPrefs {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const defaults = defaultStoryNotifPrefs();
  return {
    likes: raw.likes === false ? false : defaults.likes,
    followingUploads: raw.followingUploads === false ? false : defaults.followingUploads,
  };
}

/** Global switches only. Each person sets this on their own profile. */
export function pairAllowsStoryNotif(
  channel: StoryNotifChannel,
  selfGlobal: StoryNotifPrefs | null | undefined,
  peerGlobal: StoryNotifPrefs | null | undefined,
) {
  const defaults = defaultStoryNotifPrefs();
  return [selfGlobal, peerGlobal].every((prefs) => {
    const next = prefs || defaults;
    return next[channel] !== false;
  });
}

export function isAnonymousStoryLiker(input: {
  uid?: string;
  signInProvider?: string;
  username?: string;
}) {
  const uid = String(input.uid || "").trim();
  const provider = String(input.signInProvider || "").trim().toLowerCase();
  if (provider === "anonymous" || uid.startsWith("anon_")) return true;
  return !String(input.username || "").trim();
}

export function storyLikeNotificationCopy(input: {
  anonymous: boolean;
  likerUsername: string;
}) {
  if (input.anonymous) {
    return {
      title: "Recibiste un like",
      body: "Un anónimo likeó tu historia.",
    };
  }
  const name = String(input.likerUsername || "Alguien").trim() || "Alguien";
  return {
    title: `${name} te likeó`,
    body: "Likeó tu historia.",
  };
}

export function storyUploadNotificationCopy(username: string) {
  const name = String(username || "Alguien").trim() || "Alguien";
  return {
    title: `${name} subió una historia`,
    body: "Tocá para verla.",
  };
}

export function storyLikeOpenHref(input: {
  anonymous: boolean;
  likerUsername: string;
}) {
  if (input.anonymous) return "/stories";
  const username = String(input.likerUsername || "").trim();
  return username ? `/u/${encodeURIComponent(username)}` : "/stories";
}

export function storyUploadOpenHref(ownerUid: string, storyId = "") {
  const uid = String(ownerUid || "").trim();
  const id = String(storyId || "").trim();
  if (!uid) return "/stories";
  const base = `/stories/${encodeURIComponent(uid)}`;
  return id ? `${base}?story=${encodeURIComponent(id)}` : base;
}

export function sanitizeStoryNotificationHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  return isStoryNotificationHref(raw) ? raw.split("#")[0] : "";
}

export function isStoryNotificationHref(href: string) {
  const path = String(href || "").split("?")[0].split("#")[0];
  return path === "/stories" || path.startsWith("/stories/") || path.startsWith("/u/");
}
