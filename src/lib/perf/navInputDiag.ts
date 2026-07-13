/**
 * Shuffle nav input diagnostics — OFF by default.
 * Enable: ?navinput=1, ?navcapture=1, or localStorage sayittome:nav-input-diag=1
 */

import { getMainTabToShufflePhase } from "@/lib/navigation/mainTabToShuffleTransition";

export type NavInputDiagEvent = {
  monoMs: number;
  kind: string;
  navSeq?: number;
  pointerType?: string | null;
  isTrusted?: boolean;
  pathname?: string;
  transactionPhase?: string;
  detail?: string;
};

const RING_MAX = 200;
const RING_KEY = "__navInputDiagEventRing";

let navSeqCounter = 0;
let eventRing: NavInputDiagEvent[] = readRing();

function monoMs() {
  return Math.round(performance.timeOrigin + performance.now());
}

function readRing(): NavInputDiagEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(RING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as NavInputDiagEvent[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeRing() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RING_KEY, JSON.stringify(eventRing));
  } catch {
    /* ignore */
  }
  (window as unknown as Record<string, unknown>)[RING_KEY] = eventRing;
}

const SESSION_ENABLED_KEY = "sayittome:nav-input-diag-session";

function persistDiagSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_ENABLED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isNavInputDiagEnabled() {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("navinput=1")) {
    persistDiagSession();
    return true;
  }
  if (window.location.search.includes("navcapture=1")) {
    persistDiagSession();
    return true;
  }
  if (window.localStorage.getItem("sayittome:nav-input-diag") === "1") {
    persistDiagSession();
    return true;
  }
  try {
    return window.sessionStorage.getItem(SESSION_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function currentPathname() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

function pushNavInputEvent(kind: string, extras?: Partial<NavInputDiagEvent>) {
  if (!isNavInputDiagEnabled()) return;
  eventRing = [
    ...eventRing.slice(-RING_MAX + 1),
    {
      kind,
      monoMs: monoMs(),
      pathname: currentPathname(),
      transactionPhase: getMainTabToShufflePhase(),
      ...extras,
    },
  ];
  writeRing();
}

export function resetNavInputDiagRing() {
  if (typeof window === "undefined") return;
  eventRing = [];
  navSeqCounter = 0;
  writeRing();
  try {
    window.sessionStorage.removeItem(RING_KEY);
  } catch {
    /* ignore */
  }
}

export function exportNavInputDiagRing(): NavInputDiagEvent[] {
  eventRing = readRing();
  return [...eventRing];
}

export function tracePrepareWarmNavCalled(fromPath?: string) {
  if (!isNavInputDiagEnabled()) return;
  navSeqCounter += 1;
  pushNavInputEvent("PREPARE_WARM_NAV_CALLED", {
    navSeq: navSeqCounter,
    detail: `fromPath=${fromPath ?? currentPathname()}`,
  });
}

export function traceCompleteWarmNavCalled(fromPath?: string) {
  if (!isNavInputDiagEnabled()) return;
  pushNavInputEvent("COMPLETE_WARM_NAV_CALLED", {
    navSeq: navSeqCounter || undefined,
    detail: `fromPath=${fromPath ?? currentPathname()}`,
  });
}

export function traceRouterNavCalled(href: string, fromPath?: string) {
  if (!isNavInputDiagEnabled()) return;
  pushNavInputEvent("ROUTER_NAV_CALLED", {
    navSeq: navSeqCounter || undefined,
    detail: `href=${href}|fromPath=${fromPath ?? currentPathname()}`,
  });
}

function mapDomEventKind(type: string): string {
  switch (type) {
    case "pointerdown":
      return "NAV_INPUT_POINTERDOWN";
    case "pointerup":
      return "NAV_INPUT_POINTERUP";
    case "click":
      return "NAV_INPUT_CLICK";
    case "touchstart":
      return "NAV_INPUT_TOUCHSTART";
    case "touchend":
      return "NAV_INPUT_TOUCHEND";
    default:
      return `NAV_INPUT_${type.toUpperCase()}`;
  }
}

export function attachNavInputDiag() {
  if (typeof document === "undefined") return;
  if (!isNavInputDiagEnabled()) return;
  if ((window as unknown as { __navInputDiagAttached?: boolean }).__navInputDiagAttached) return;
  (window as unknown as { __navInputDiagAttached?: boolean }).__navInputDiagAttached = true;

  const selector = '.sayittome-bottom-nav [data-nav-tab="shuffle"]';
  const types = ["pointerdown", "pointerup", "click", "touchstart", "touchend"] as const;

  for (const type of types) {
    document.addEventListener(
      type,
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(selector)) return;
        const pointerEvent = event as PointerEvent;
        pushNavInputEvent(mapDomEventKind(type), {
          pointerType: "pointerType" in pointerEvent ? pointerEvent.pointerType : null,
          isTrusted: event.isTrusted,
          detail: `tab=shuffle|type=${type}`,
        });
      },
      true,
    );
  }

  const win = window as unknown as {
    __navInputDiagExport?: () => NavInputDiagEvent[];
    __navInputDiagReset?: () => void;
  };
  win.__navInputDiagExport = exportNavInputDiagRing;
  win.__navInputDiagReset = resetNavInputDiagRing;
}
