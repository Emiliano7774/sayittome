/**
 * Global instant-navigation policy for SayItToMe.
 *
 * Visual rule: never replace rendered UI with a loading shell during in-app
 * transitions. Keep the last valid frame visible until the next state is ready.
 *
 * Implementation layers (already wired across the app):
 * - Keep-alive hosts: shuffle + main tabs stay mounted after first visit.
 * - Session hydration gates: shouldShow*Loading / has*EverHydrated hooks.
 * - Client caches: storiesIndexStore, profileCache, inboxSnapshot, chatMessageCache.
 * - Prefetch: Link prefetch, story/profile/chat prefetch on intent.
 * - fastRouterPush/Replace: immediate route changes without view-transition flashes.
 */

export const INSTANT_NAV_SESSION_PREFIX = "sayittome:instant-nav:";

export function readInstantNavFlag(key: string) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(`${INSTANT_NAV_SESSION_PREFIX}${key}`) === "1";
}

export function writeInstantNavFlag(key: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${INSTANT_NAV_SESSION_PREFIX}${key}`, "1");
}

/** True when a full-page loading shell must not appear during internal navigation. */
export function shouldSuppressRouteLoadingShell(input: {
  hasCachedContent: boolean;
  hasEverHydrated: boolean;
  networkLoading: boolean;
}) {
  if (input.hasCachedContent) return true;
  if (input.hasEverHydrated) return true;
  return !input.networkLoading;
}
