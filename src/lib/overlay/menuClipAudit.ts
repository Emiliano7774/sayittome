export type ClipStyle = {
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  transform?: string;
  filter?: string;
  contain?: string;
  willChange?: string;
  perspective?: string;
};

export type ClipAncestor = {
  overflowX: string;
  overflowY: string;
  clipsFixed: boolean;
  reason: string;
};

function axisClips(value: string | undefined) {
  const v = String(value || "visible").toLowerCase();
  return v === "hidden" || v === "auto" || v === "scroll";
}

export function doesOverflowClipFixed(style: ClipStyle) {
  const overflowX = String(style.overflowX || style.overflow || "visible");
  const overflowY = String(style.overflowY || style.overflow || "visible");
  if (axisClips(overflowX) || axisClips(overflowY)) return true;
  const transform = String(style.transform || "none");
  if (transform && transform !== "none") return true;
  const filter = String(style.filter || "none");
  if (filter && filter !== "none") return true;
  const contain = String(style.contain || "none");
  if (contain && contain !== "none") return true;
  const perspective = String(style.perspective || "none");
  if (perspective && perspective !== "none") return true;
  const willChange = String(style.willChange || "");
  if (/\b(transform|filter|perspective)\b/.test(willChange)) return true;
  return false;
}

export function collectFixedClipAncestors(
  chain: Array<{ style: ClipStyle }>,
): ClipAncestor[] {
  return chain
    .map((node) => {
      const overflowX = String(node.style.overflowX || node.style.overflow || "visible");
      const overflowY = String(node.style.overflowY || node.style.overflow || "visible");
      const clipsFixed = doesOverflowClipFixed(node.style);
      const reason = clipsFixed
        ? axisClips(overflowX) || axisClips(overflowY)
          ? `overflow:${overflowX}/${overflowY}`
          : "containing-block"
        : "";
      return { overflowX, overflowY, clipsFixed, reason };
    })
    .filter((row) => row.clipsFixed);
}

export function measureMenuBox(input: {
  scrollHeight: number;
  clientHeight: number;
  boundingHeight: number;
}) {
  const intrinsic = Math.max(0, Math.round(input.scrollHeight));
  const visible = Math.max(0, Math.round(input.boundingHeight || input.clientHeight));
  return {
    intrinsicHeight: intrinsic,
    visibleHeight: visible,
    clipped: intrinsic > visible + 1,
  };
}

export function unlockDocumentFixedClip(doc: Document | null | undefined) {
  if (!doc?.documentElement || !doc.body) {
    return () => {};
  }
  const html = doc.documentElement;
  const body = doc.body;
  const prevHtml = html.style.overflowX;
  const prevBody = body.style.overflowX;
  html.style.overflowX = "clip";
  body.style.overflowX = "clip";
  html.classList.add("sayittome-menu-fixed-unlock");
  return () => {
    html.style.overflowX = prevHtml;
    body.style.overflowX = prevBody;
    html.classList.remove("sayittome-menu-fixed-unlock");
  };
}

export function areMenuActionsFullyVisible(input: {
  actions: Array<{ top: number; bottom: number; left: number; right: number }>;
  viewport: { offsetTop: number; offsetLeft: number; width: number; height: number };
  minCount?: number;
}) {
  const minCount = input.minCount ?? 2;
  if (input.actions.length < minCount) return false;
  const top = input.viewport.offsetTop;
  const left = input.viewport.offsetLeft;
  const bottom = top + input.viewport.height;
  const right = left + input.viewport.width;
  return input.actions.slice(0, minCount).every((action) => {
    return (
      action.top >= top - 0.5 &&
      action.bottom <= bottom + 0.5 &&
      action.left >= left - 0.5 &&
      action.right <= right + 0.5
    );
  });
}
