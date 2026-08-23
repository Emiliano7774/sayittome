import type { CSSProperties } from "react";

import { isNativeAppShell } from "@/lib/app/nativeShell";

export const PROFILE_OPTIONS_SHEET_GUTTER_PX = 12;
export const PROFILE_OPTIONS_SHEET_LIFT_PX = 8;
export const PROFILE_OPTIONS_MIN_TOUCH_PX = 48;
export const PROFILE_OPTIONS_NAV_FALLBACK_PX = 74;
export const PROFILE_OPTIONS_SHEET_MAX_MQ = "(max-width: 767px)";

export const PROFILE_OPTIONS_OPEN_GUARD_MS = 400;
export const PROFILE_OPTIONS_TRIGGER_MIN_PX = 48;

export function shouldIgnoreProfileOptionsDismiss(openedAt: number, now = Date.now()) {
  return openedAt > 0 && now - openedAt < PROFILE_OPTIONS_OPEN_GUARD_MS;
}

export const PROFILE_OPTIONS_SHEET_ATTR = "data-profile-options-sheet";
export const PROFILE_OPTIONS_LAYER_ATTR = "data-profile-options-layer";
export const PROFILE_OPTIONS_BACKDROP_ATTR = "data-profile-options-backdrop";

type ClassListHost = {
  classList?: { contains: (name: string) => boolean };
};

export function shouldUseProfileOptionsSheet(
  win: {
    innerWidth?: number;
    matchMedia?: (query: string) => { matches: boolean };
    document?: {
      documentElement?: ClassListHost | null;
      body?: ClassListHost | null;
    };
  } | null | undefined,
) {
  if (!win) return false;
  const root = win.document?.documentElement;
  const body = win.document?.body;
  if (root?.classList?.contains("sayittome-native-shell")) return true;
  if (body?.classList?.contains("sayittome-native-shell")) return true;
  if (typeof window !== "undefined" && isNativeAppShell()) return true;
  if (typeof win.matchMedia === "function") {
    return win.matchMedia(PROFILE_OPTIONS_SHEET_MAX_MQ).matches;
  }
  return (win.innerWidth ?? 390) < 768;
}

/** Immediate CSS geometry — no rAF / getBoundingClientRect positioning. */
export function getProfileOptionsSheetStyle(): CSSProperties {
  const gutter = PROFILE_OPTIONS_SHEET_GUTTER_PX;
  const lift = PROFILE_OPTIONS_SHEET_LIFT_PX;
  const nav = PROFILE_OPTIONS_NAV_FALLBACK_PX;
  return {
    position: "fixed",
    left: `max(${gutter}px, env(safe-area-inset-left, 0px))`,
    width: `calc(100vw - max(${gutter * 2}px, env(safe-area-inset-left, 0px) + env(safe-area-inset-right, 0px)))`,
    maxWidth: `calc(100vw - max(${gutter * 2}px, env(safe-area-inset-left, 0px) + env(safe-area-inset-right, 0px)))`,
    bottom: `calc(var(--sayittome-bottom-ui, ${nav}px) + ${lift}px)`,
    maxHeight: `min(72dvh, calc(100dvh - var(--sayittome-bottom-ui, ${nav}px) - env(safe-area-inset-top, 0px) - ${lift * 2}px))`,
    overflowX: "hidden",
    overflowY: "auto",
    boxSizing: "border-box",
    zIndex: 1000002,
    visibility: "visible",
  };
}

export function getProfileOptionsActionStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    width: "100%",
    minHeight: PROFILE_OPTIONS_MIN_TOUCH_PX,
    padding: "12px 16px",
    textAlign: "left",
    overflow: "visible",
    whiteSpace: "normal",
    lineHeight: 1.3,
    boxSizing: "border-box",
  };
}

export function styleRecordToCss(style: CSSProperties) {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
      const unitless = key === "zIndex" || key === "lineHeight" || key === "opacity";
      const cssValue =
        typeof value === "number" && !unitless ? `${value}px` : String(value);
      return `${cssKey}:${cssValue}`;
    })
    .join(";");
}
