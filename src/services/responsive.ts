export const MOBILE_BREAKPOINT = 700;

export function isMobilePortrait() {
  if (typeof window === "undefined") return false;

  return window.innerWidth < MOBILE_BREAKPOINT;
}
