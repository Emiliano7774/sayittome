const PROFILE_HYDRATED_SESSION_KEY = "sayittome:profile:hydrated:v1";

type ProfileGateInput = {
  loading: boolean;
  hasProfile: boolean;
};

let profileHasHydratedOnce = false;

function readPersistedProfileHydrated() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(PROFILE_HYDRATED_SESSION_KEY) === "1";
}

function persistProfileHydrated() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PROFILE_HYDRATED_SESSION_KEY, "1");
}

if (readPersistedProfileHydrated()) {
  profileHasHydratedOnce = true;
}

export function hasProfileEverHydrated() {
  return profileHasHydratedOnce || readPersistedProfileHydrated();
}

export function markProfileHydrated() {
  profileHasHydratedOnce = true;
  persistProfileHydrated();
}

/** Full-page profile loader only on the very first cold open with no cached profile. */
export function shouldShowProfileLoading(input: ProfileGateInput) {
  if (input.hasProfile) {
    markProfileHydrated();
    return false;
  }

  if (hasProfileEverHydrated()) {
    return false;
  }

  return input.loading;
}
