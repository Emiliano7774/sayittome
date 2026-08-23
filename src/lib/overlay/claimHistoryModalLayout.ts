import type { CSSProperties } from "react";

export const CLAIM_HISTORY_NAV_FALLBACK_PX = 74;
export const CLAIM_HISTORY_GUTTER_PX = 12;
export const CLAIM_HISTORY_LAYER_ATTR = "data-claim-history-layer";
export const CLAIM_HISTORY_SHEET_ATTR = "data-claim-history-sheet";
export const CLAIM_HISTORY_HEADER_ATTR = "data-claim-history-header";
export const CLAIM_HISTORY_SCROLL_ATTR = "data-claim-history-scroll";
export const CLAIM_HISTORY_CLOSE_ATTR = "data-claim-history-close";

export function claimHistoryModalSlots() {
  return ["header", "scroll-body", "receipts-none"] as const;
}

export function resolveClaimHistorySheetMaxHeightPx(input: {
  visualViewportHeight?: number;
  innerHeight: number;
  bottomUiPx: number;
  safeTopPx?: number;
  gutterPx?: number;
}) {
  const gutter = input.gutterPx ?? CLAIM_HISTORY_GUTTER_PX;
  const safeTop = Math.max(0, input.safeTopPx ?? 0);
  const viewport = Math.min(
    input.visualViewportHeight && input.visualViewportHeight > 0
      ? input.visualViewportHeight
      : input.innerHeight,
    input.innerHeight,
  );
  const reserved = Math.max(0, input.bottomUiPx) + safeTop + gutter * 2;
  const capped = Math.min(viewport * 0.88, viewport - reserved);
  return Math.max(180, Math.round(capped));
}

/** Published first paint: 88dvh, no bottom-nav reserve. */
export function resolvePublishedClaimHistorySheetMaxHeightPx(innerHeight: number) {
  return Math.round(innerHeight * 0.88);
}

function sheetMaxHeightCss() {
  const nav = CLAIM_HISTORY_NAV_FALLBACK_PX;
  const gutters = CLAIM_HISTORY_GUTTER_PX * 2;
  return `min(88dvh, calc(100dvh - var(--sayittome-bottom-ui, ${nav}px) - env(safe-area-inset-top, 0px) - ${gutters}px), calc(100svh - var(--sayittome-bottom-ui, ${nav}px) - ${gutters}px))`;
}

export function getClaimHistoryOverlayStyle(): CSSProperties {
  const nav = CLAIM_HISTORY_NAV_FALLBACK_PX;
  const gutter = CLAIM_HISTORY_GUTTER_PX;
  return {
    position: "fixed",
    inset: 0,
    zIndex: 1000000,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    paddingTop: `max(${gutter}px, env(safe-area-inset-top, 0px))`,
    paddingLeft: `max(${gutter}px, env(safe-area-inset-left, 0px))`,
    paddingRight: `max(${gutter}px, env(safe-area-inset-right, 0px))`,
    paddingBottom: `max(${gutter}px, var(--sayittome-bottom-ui, ${nav}px))`,
  };
}

export function getClaimHistorySheetStyle(): CSSProperties {
  const maxHeight = sheetMaxHeightCss();
  return {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "36rem",
    minHeight: 0,
    height: maxHeight,
    maxHeight,
    overflow: "hidden",
    boxSizing: "border-box",
  };
}

export function getClaimHistoryHeaderStyle(): CSSProperties {
  return {
    flexShrink: 0,
  };
}

export function getClaimHistoryScrollStyle(): CSSProperties {
  return {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    touchAction: "pan-y",
    WebkitOverflowScrolling: "touch",
  };
}

export function resolveClaimHistoryModalPortalRoot(
  doc: Pick<Document, "body"> | null | undefined,
) {
  return doc?.body ?? null;
}

export function styleRecordToCss(style: CSSProperties) {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
      const unitless =
        key === "zIndex" || key === "lineHeight" || key === "opacity" || key === "flex";
      const cssValue =
        typeof value === "number" && !unitless ? `${value}px` : String(value);
      return `${cssKey}:${cssValue}`;
    })
    .join(";");
}
