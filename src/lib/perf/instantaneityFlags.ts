/**
 * Dev-only instantaneity feature flags for bisecting ghost-frame regressions.
 * Production always uses the safe defaults below (visual-first tabs OFF).
 */

export type InstantaneityFlag =
  | "PROFILE_CHAT_WARMUP"
  | "VISUAL_FIRST_TABS"
  | "STORY_MEDIA_BUFFERS"
  | "MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE";

const PRODUCTION_DEFAULTS: Record<InstantaneityFlag, boolean> = {
  PROFILE_CHAT_WARMUP: true,
  VISUAL_FIRST_TABS: false,
  STORY_MEDIA_BUFFERS: true,
  MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE: true,
};

const DEV_DEFAULTS: Record<InstantaneityFlag, boolean> = {
  ...PRODUCTION_DEFAULTS,
};

const STORAGE_PREFIX = "sayittome-flag-";

function isLocalDiagnosticHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

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
  if (typeof window !== "undefined" && isLocalDiagnosticHost()) {
    const localOverride = readDevOverride(flag);
    if (localOverride !== null) return localOverride;
  }
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

export function isMainTabToShuffleMicroSlideEnabled() {
  return isInstantaneityFlagEnabled("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE");
}

/** Build-time default baked into the client bundle (not runtime localStorage). */
export function getMicroSlideBuildDefault(): boolean {
  return PRODUCTION_DEFAULTS.MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE;
}

export function getMicroSlideLocalStorageOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  return readDevOverride("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE");
}

export function isMicroSlideLocalOverrideHost(): boolean {
  return isLocalDiagnosticHost();
}
