import { MAIN_TAB_HREFS, type MainTabHref } from "@/lib/navigation/mainTabs";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function isMainTabHref(path: string): path is MainTabHref {
  return (MAIN_TAB_HREFS as readonly string[]).includes(path);
}

let presentedTab: MainTabHref | null = null;
let handoffTarget: MainTabHref | null = null;
let handoffVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  handoffVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeAtomicMainTabHandoff(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAtomicMainTabHandoffVersion() {
  return handoffVersion;
}

export function isAtomicMainTabHandoffActive() {
  return handoffTarget !== null;
}

export function getPresentedMainTab(pathname: string) {
  if (presentedTab) return presentedTab;
  const path = normalizePath(pathname);
  return isMainTabHref(path) ? path : path;
}

export function getMainTabHandoffTarget() {
  return handoffTarget;
}

export function seedPresentedMainTab(href: MainTabHref) {
  if (!presentedTab) {
    presentedTab = href;
    notify();
  }
}

/** Route changed — retain current presentation until destination primary is ready. */
export function onMainTabRouteChange(pathname: string) {
  const path = normalizePath(pathname);
  if (!isMainTabHref(path)) return;

  const next = path as MainTabHref;
  if (!presentedTab) {
    presentedTab = next;
    handoffTarget = null;
    notify();
    return;
  }

  if (presentedTab === next) {
    handoffTarget = null;
    markMainTabHandoffPendingDom(false);
    return;
  }

  handoffTarget = next;
  markMainTabHandoffPendingDom(true);
  notify();
}

function mainTabPrimarySelector(href: MainTabHref) {
  if (href === "/settings") return "[data-nav-settings-primary]";
  return "[data-nav-primary-content]";
}

function isPresentablePrimary(host: HTMLElement, primary: Element) {
  if (host.querySelector("[data-loading-shell]")) return false;

  const text = primary.textContent?.slice(0, 240) ?? "";
  if (/Cargando\.\.\.|Loading\.\.\./i.test(text)) return false;

  const rect = primary.getBoundingClientRect();
  const style = getComputedStyle(primary);
  return (
    rect.width >= 24 &&
    rect.height >= 24 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    style.opacity !== "0"
  );
}

export function isMainTabPrimaryReady(href: MainTabHref) {
  if (typeof document === "undefined") return false;

  const host = document.getElementById(`sayittome-main-tab-keepalive-${href.slice(1)}`);
  if (!host) return false;

  const primary = host.querySelector(mainTabPrimarySelector(href));
  if (!primary) return false;

  return isPresentablePrimary(host, primary);
}

/** Commit destination only when route and primary content are coherent. */
export function commitPresentedMainTabIfReady(pathname: string) {
  const path = normalizePath(pathname);
  if (!handoffTarget || handoffTarget !== path) return false;
  if (!isMainTabPrimaryReady(handoffTarget)) return false;

  presentedTab = handoffTarget;
  handoffTarget = null;
  markMainTabHandoffPendingDom(false);
  notify();
  return true;
}

export function resetPresentedMainTab(href?: MainTabHref) {
  presentedTab = href ?? null;
  handoffTarget = null;
  markMainTabHandoffPendingDom(false);
  notify();
}

function markMainTabHandoffPendingDom(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("sayittome-main-tab-handoff-pending", active);
  if (active && presentedTab) {
    document.documentElement.dataset.sayittomeMainTabHandoffSource =
      presentedTab.slice(1);
  } else {
    delete document.documentElement.dataset.sayittomeMainTabHandoffSource;
  }
}

export function exportMainTabHandoffState(pathname: string) {
  return {
    pathname: normalizePath(pathname),
    presentedTab,
    handoffTarget,
    handoffPending: handoffTarget !== null,
  };
}
