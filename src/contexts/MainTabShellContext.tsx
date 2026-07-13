"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  isMainTabHref,
  type MainTabHref,
} from "@/lib/navigation/mainTabs";
import {
  CLEAR_SHELL_EVENT,
  OPEN_MAIN_TAB_EVENT,
} from "@/lib/navigation/mainTabShellBridge";
import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import {
  hardNavigate,
  shouldHardNavigatePath,
} from "@/lib/navigation/hardNavigate";
import { pinMainTabKeepAlive } from "@/lib/navigation/mainTabKeepAlive";
import { recordNativeNavPath } from "@/lib/navigation/nativeNavStack";
import {
  getCurrentMainTabPathname,
  getMainTabInternalPathnameVersion,
  resetMainTabHistoryPathnameStore,
  subscribeMainTabPathname,
} from "@/lib/navigation/mainTabInternalPathnameStore";
import MainTabKeepAliveHost from "@/components/navigation/MainTabKeepAliveHost";

type MainTabShellContextValue = {
  effectivePathname: string;
  openMainTab: (href: MainTabHref) => void;
  isMainTabHref: (href: string) => href is MainTabHref;
  shellMountedTabs: ReadonlySet<MainTabHref>;
  childrenHidden: boolean;
  activeShellTab: MainTabHref | null;
};

declare global {
  interface Window {
    __sayittomeActiveShellTab?: MainTabHref | null;
  }
}

const MainTabShellContext = createContext<MainTabShellContextValue | null>(null);

export function MainTabShellProvider({
  children,
  chrome,
}: {
  children: ReactNode;
  chrome?: ReactNode;
}) {
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const resolvedPathname = getCurrentMainTabPathname(nextPathname);
  const router = useRouter();
  const [shellTab, setShellTab] = useState<MainTabHref | null>(null);
  const shellMountedTabs = useMemo(() => new Set<MainTabHref>(), []);

  useEffect(() => {
    if (isMainTabHref(resolvedPathname)) return;
    setShellTab(null);
  }, [resolvedPathname]);

  useEffect(() => {
    window.__sayittomeActiveShellTab = shellTab;
    document.body.classList.toggle("sayittome-main-tab-shell-active", shellTab !== null);

    return () => {
      window.__sayittomeActiveShellTab = null;
      document.body.classList.remove("sayittome-main-tab-shell-active");
    };
  }, [shellTab]);

  const openMainTab = useCallback(
    (href: MainTabHref) => {
      setShellTab(null);
      resetMainTabHistoryPathnameStore("open-main-tab");
      if (href === resolvedPathname) return;
      pinMainTabKeepAlive();
      recordNativeNavPath(href);
      releaseChatViewportLock();
      if (isNativeAppShell() && shouldHardNavigatePath(href)) {
        hardNavigate(href);
        return;
      }
      router.push(href);
    },
    [resolvedPathname, router],
  );

  useEffect(() => {
    function clearShell() {
      setShellTab(null);
    }

    function openShell(event: Event) {
      const href = (event as CustomEvent<{ href?: MainTabHref }>).detail?.href;
      if (href && isMainTabHref(href)) {
        openMainTab(href);
      }
    }

    window.addEventListener(CLEAR_SHELL_EVENT, clearShell);
    window.addEventListener(OPEN_MAIN_TAB_EVENT, openShell);
    return () => {
      window.removeEventListener(CLEAR_SHELL_EVENT, clearShell);
      window.removeEventListener(OPEN_MAIN_TAB_EVENT, openShell);
    };
  }, [openMainTab]);

  const activeShellTab = shellTab;
  const childrenHidden = activeShellTab !== null;
  const effectivePathname = activeShellTab ?? resolvedPathname;

  const value = useMemo<MainTabShellContextValue>(
    () => ({
      effectivePathname,
      openMainTab,
      isMainTabHref,
      shellMountedTabs,
      childrenHidden,
      activeShellTab,
    }),
    [
      activeShellTab,
      childrenHidden,
      effectivePathname,
      openMainTab,
      shellMountedTabs,
    ],
  );

  return (
    <MainTabShellContext.Provider value={value}>
      <div
        className="sayittome-route-shell"
        hidden={childrenHidden}
        aria-hidden={childrenHidden}
      >
        {children}
      </div>
      <MainTabKeepAliveHost />
      {chrome}
    </MainTabShellContext.Provider>
  );
}

export function useMainTabShell() {
  const context = useContext(MainTabShellContext);
  if (!context) {
    throw new Error("useMainTabShell must be used within MainTabShellProvider");
  }
  return context;
}

export function useEffectivePathname() {
  const shell = useContext(MainTabShellContext);
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const pathname = getCurrentMainTabPathname(nextPathname);
  return shell?.effectivePathname ?? pathname;
}

export function useMainTabRouteActive(href: MainTabHref) {
  const nextPathname = usePathname();
  useSyncExternalStore(
    subscribeMainTabPathname,
    getMainTabInternalPathnameVersion,
    getMainTabInternalPathnameVersion,
  );
  const pathname = getCurrentMainTabPathname(nextPathname);
  return pathname === href;
}
