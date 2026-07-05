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
import { usePathname } from "next/navigation";

import {
  isMainTabHref,
  type MainTabHref,
} from "@/lib/navigation/mainTabs";
import {
  CLEAR_SHELL_EVENT,
  OPEN_MAIN_TAB_EVENT,
} from "@/lib/navigation/mainTabShellBridge";
import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { pinMainTabKeepAlive } from "@/lib/navigation/mainTabKeepAlive";
import { recordNativeNavPath } from "@/lib/navigation/nativeNavStack";
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
  const [shellTab, setShellTab] = useState<MainTabHref | null>(null);
  const shellMountedTabs = useMemo(() => new Set<MainTabHref>(), []);

  useEffect(() => {
    if (isMainTabHref(nextPathname)) return;
    setShellTab(null);
  }, [nextPathname]);

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
      if (href === nextPathname) {
        setShellTab(null);
        return;
      }

      pinMainTabKeepAlive();
      recordNativeNavPath(href);
      releaseChatViewportLock();
      setShellTab(href);
    },
    [nextPathname],
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
  const effectivePathname = activeShellTab ?? nextPathname;

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
        className={childrenHidden ? "sayittome-main-tab-route-hidden" : undefined}
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
  const pathname = usePathname();
  return shell?.effectivePathname ?? pathname;
}

export function useMainTabRouteActive(href: MainTabHref) {
  return useEffectivePathname() === href;
}
