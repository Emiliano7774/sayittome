export type RectLike = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

export type ViewportBox = {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
};

export type FitAnchoredMenuInput = {
  anchor: RectLike;
  viewport: ViewportBox;
  menuWidth: number;
  estimatedHeight: number;
  padding?: number;
  bottomReserve?: number;
};

export type FitAnchoredMenuResult = {
  top: number;
  right: number;
  maxHeight: number;
  overflowY: "auto" | "visible";
  placement: "below" | "above";
};

export function readVisualViewportBox(
  win: Pick<Window, "visualViewport" | "innerWidth" | "innerHeight"> | null | undefined,
): ViewportBox {
  const viewport = win?.visualViewport;
  if (viewport) {
    return {
      offsetTop: viewport.offsetTop,
      offsetLeft: viewport.offsetLeft,
      width: viewport.width,
      height: viewport.height,
    };
  }
  return {
    offsetTop: 0,
    offsetLeft: 0,
    width: win?.innerWidth ?? 390,
    height: win?.innerHeight ?? 844,
  };
}

export function readBottomUiReserve(doc: Document | null | undefined) {
  if (!doc) return 0;
  const raw = doc.documentElement
    ? getComputedStyle(doc.documentElement).getPropertyValue("--sayittome-bottom-ui")
    : "";
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return 74;
}

export function fitAnchoredMenu(input: FitAnchoredMenuInput): FitAnchoredMenuResult {
  const padding = input.padding ?? 8;
  const bottomReserve = Math.max(0, input.bottomReserve ?? 0);
  const viewportTop = input.viewport.offsetTop;
  const viewportLeft = input.viewport.offsetLeft;
  const viewportBottom = viewportTop + input.viewport.height;
  const viewportRight = viewportLeft + input.viewport.width;
  const usableBottom = viewportBottom - padding - bottomReserve;
  const usableTop = viewportTop + padding;

  const spaceBelow = Math.max(0, usableBottom - input.anchor.bottom);
  const spaceAbove = Math.max(0, input.anchor.top - usableTop);
  const minMenu = Math.min(96, input.estimatedHeight);
  const viewportBudget = Math.max(
    72,
    Math.floor(input.viewport.height - padding * 2 - bottomReserve),
  );
  const placeBelow =
    spaceBelow >= minMenu || spaceBelow >= spaceAbove || spaceAbove < minMenu;

  const rawMax = placeBelow ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(72, Math.min(viewportBudget, Math.floor(rawMax || viewportBudget)));
  const height = Math.min(input.estimatedHeight, maxHeight);
  const unclampedTop = placeBelow
    ? input.anchor.bottom + padding
    : input.anchor.top - padding - height;
  const top = Math.min(
    Math.max(usableTop, unclampedTop),
    Math.max(usableTop, usableBottom - height),
  );

  const right = Math.max(padding, viewportRight - input.anchor.right);
  const overflowY = height < input.estimatedHeight - 1 || maxHeight < input.estimatedHeight
    ? "auto"
    : "visible";

  return {
    top: Math.round(top),
    right: Math.round(right),
    maxHeight,
    overflowY,
    placement: placeBelow ? "below" : "above",
  };
}
