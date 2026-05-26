import type { AppLocale } from "@/lib/i18n/types";
import { getMessage } from "@/lib/i18n/getMessage";
import {
  isLiveByConnection,
  isRecentlyActive,
  ONLINE_WINDOW_MS,
  parsePresenceDate,
} from "@/lib/presence";

export function formatLastSeenLocalized(
  locale: AppLocale,
  lastActive?: string | null,
  online?: boolean,
  windowMs = ONLINE_WINDOW_MS,
): string {
  if (isRecentlyActive(lastActive, online, windowMs)) {
    return getMessage(locale, "presence_online");
  }

  const date = parsePresenceDate(lastActive);
  if (!date) return getMessage(locale, "presence_no_recent");

  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return getMessage(locale, "presence_just_now");

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return getMessage(locale, "presence_last_min", { minutes: String(minutes) });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return getMessage(locale, "presence_last_hours", { hours: String(hours) });
  }

  const days = Math.floor(hours / 24);
  return getMessage(locale, "presence_last_days", { days: String(days) });
}

export function isPresenceOnline(
  lastActive?: string | null,
  online?: boolean,
  windowMs = ONLINE_WINDOW_MS,
) {
  return isRecentlyActive(lastActive, online, windowMs);
}

export { isLiveByConnection, ONLINE_WINDOW_MS };
