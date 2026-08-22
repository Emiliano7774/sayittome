/** Session-scoped dismiss for the public Home native notice. */

export const WEB_HOME_BANNER_DISMISSED_KEY = "sayittome_web_home_banner_dismissed_v1";
export const WEB_HOME_BANNER_SESSION_KEY = "sayittome_web_home_banner_dismissed_session_v1";

let dismissedThisLaunch = false;

function readSessionDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(WEB_HOME_BANNER_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WEB_HOME_BANNER_SESSION_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

function forgetPermanentDismiss() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WEB_HOME_BANNER_DISMISSED_KEY);
  } catch {
    // ignore
  }
}

/** True after X in this native process / WebView session. Route changes must not reset. */
export function isWebHomeBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  if (dismissedThisLaunch || readSessionDismissed()) return true;
  forgetPermanentDismiss();
  return false;
}

export function dismissWebHomeBanner() {
  dismissedThisLaunch = true;
  writeSessionDismissed();
  forgetPermanentDismiss();
}

export function isHomeNoticeDismissedThisLaunch() {
  return dismissedThisLaunch || readSessionDismissed();
}

/** Test-only: simulate a new cold launch / native process. */
export function resetHomeNoticeDismissForTests() {
  dismissedThisLaunch = false;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WEB_HOME_BANNER_SESSION_KEY);
    window.localStorage.removeItem(WEB_HOME_BANNER_DISMISSED_KEY);
  } catch {
    // ignore
  }
}
