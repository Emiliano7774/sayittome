/**
 * Dev-only instantaneity feature flags for bisecting ghost-frame regressions.
 * Production always uses the safe defaults below (visual-first tabs OFF).
 */

export type InstantaneityFlag =
  | "PROFILE_CHAT_WARMUP"
  | "VISUAL_FIRST_TABS"
  | "STORY_MEDIA_BUFFERS";

const PRODUCTION_DEFAULTS: Record<InstantaneityFlag, boolean> = {
  PROFILE_CHAT_WARMUP: true,
  VISUAL_FIRST_TABS: false,
  STORY_MEDIA_BUFFERS: true,
};

const DEV_DEFAULTS: Record<InstantaneityFlag, boolean> = {
  ...PRODUCTION_DEFAULTS,
};

const STORAGE_PREFIX = "sayittome-flag-";

function readDevOverride(flag: InstantaneityFlag): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${flag}`);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* ignore */
  }
  return null;
}

export function isInstantaneityFlagEnabled(flag: InstantaneityFlag): boolean {
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_DEFAULTS[flag];
  }
  const override = readDevOverride(flag);
  if (override !== null) return override;
  return DEV_DEFAULTS[flag];
}

export function isVisualFirstTabsEnabled() {
  return isInstantaneityFlagEnabled("VISUAL_FIRST_TABS");
}

export function isProfileChatWarmupEnabled() {
  return isInstantaneityFlagEnabled("PROFILE_CHAT_WARMUP");
}

export function isStoryMediaBuffersEnabled() {
  return isInstantaneityFlagEnabled("STORY_MEDIA_BUFFERS");
}
