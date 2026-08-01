/**
 * Cache-Control policy for Firebase Storage uploads.
 *
 * Important:
 * - Tokens in download URLs are still shareable while `allow read: if true`.
 * - `public` means shared caches may store the response; only use it for
 *   intentionally public, path-versioned profile/story media.
 * - Chat / view-once / moderation evidence must stay private (or no-store).
 */

export type StorageCacheCategory =
  | "public_profile"
  | "public_story"
  | "chat"
  | "view_once"
  | "report_evidence"
  | "appeal"
  | "private_default";

export type StorageCacheOptions = {
  viewOnce?: boolean;
  category?: StorageCacheCategory;
};

/** Public profile/avatar/gallery objects use unique timestamped paths. */
export const PUBLIC_PROFILE_CACHE_CONTROL =
  "public,max-age=31536000,immutable";

/** Stories are path-versioned; keep a day-scale shared cache aligned with product TTL. */
export const PUBLIC_STORY_CACHE_CONTROL = "public,max-age=86400";

/** Chat media: browser-private cache only (not shared CDN/proxy). */
export const CHAT_CACHE_CONTROL = "private,max-age=86400";

/** View-once / bombs: never store in HTTP caches. */
export const VIEW_ONCE_CACHE_CONTROL = "private,no-store";

/** Report evidence / appeals: sensitive moderation material. */
export const EVIDENCE_CACHE_CONTROL = "private,no-store";

export const PRIVATE_DEFAULT_CACHE_CONTROL = "private,max-age=3600";

export function resolveStorageCacheCategory(
  path: string,
  options: StorageCacheOptions = {},
): StorageCacheCategory {
  if (options.category) return options.category;
  if (options.viewOnce) return "view_once";

  const normalized = String(path || "").replace(/^\/+/, "");
  if (normalized.startsWith("usuarios/")) return "public_profile";
  if (normalized.startsWith("historias/")) return "public_story";
  if (
    normalized.startsWith("chats/") ||
    normalized.startsWith("chat_media/") ||
    normalized.startsWith("chats_anonimos/")
  ) {
    return "chat";
  }
  if (normalized.startsWith("report_evidence/")) return "report_evidence";
  if (normalized.startsWith("roleplay_appeals/")) return "appeal";
  return "private_default";
}

export function cacheControlForCategory(category: StorageCacheCategory): string {
  switch (category) {
    case "public_profile":
      return PUBLIC_PROFILE_CACHE_CONTROL;
    case "public_story":
      return PUBLIC_STORY_CACHE_CONTROL;
    case "chat":
      return CHAT_CACHE_CONTROL;
    case "view_once":
      return VIEW_ONCE_CACHE_CONTROL;
    case "report_evidence":
    case "appeal":
      return EVIDENCE_CACHE_CONTROL;
    default:
      return PRIVATE_DEFAULT_CACHE_CONTROL;
  }
}

export function cacheControlForStoragePath(
  path: string,
  options: StorageCacheOptions = {},
): string {
  return cacheControlForCategory(resolveStorageCacheCategory(path, options));
}

export function storageUploadMetadata(
  contentType: string,
  path = "",
  options: StorageCacheOptions = {},
) {
  return {
    contentType,
    cacheControl: cacheControlForStoragePath(path, options),
  };
}

/** Prefixes safe for public long-cache backfill. */
export const PUBLIC_BACKFILL_PREFIXES = ["usuarios/", "historias/"] as const;

/** Prefixes that must never receive public/shared cacheControl. */
export const PRIVATE_BACKFILL_PREFIXES = [
  "chats/",
  "chat_media/",
  "chats_anonimos/",
  "report_evidence/",
  "roleplay_appeals/",
] as const;
