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

import MainTabShellPanels from "@/components/navigation/MainTabShellPanels";
import {
  isMainTabHref,
  readBrowserPathname,
  type MainTabHref,
} from "@/lib/navigation/mainTabs";

type MainTabShellContextValue = {
  effectivePathname: string;
  openMainTab: (href: MainTabHref) => void;
  isMainTabHref: (href: string) => href is MainTabHref;
  shellMountedTabs: ReadonlySet<MainTabHref>;
  childrenHidden: boolean;
  activeShellTab: MainTabHref | null;
};

const MainTabShellContext = createContext<MainTabShellContextValue | null>(null);

function resolveShellTabFromUrl(pathname: string): MainTabHref | null {
  return isMainTabHref(pathname) ? pathname : null;
}

export function MainTabShellProvider({
  children,
  chrome,
}: {
  children: ReactNode;
  chrome?: ReactNode;
}) {
  const nextPathname = usePathname();
  const [shellTab, setShellTab] = useState<MainTabHref | null>(null);
  const [shellMountedTabs, setShellMountedTabs] = useState<Set<MainTabHref>>(
    () => new Set(),
  );

  useEffect(() => {
    setShellTab(null);
  }, [nextPathname]);

  useEffect(() => {
    const onPopState = () => {
      const tab = resolveShellTabFromUrl(readBrowserPathname());
      if (!tab || tab === nextPathname) {
        setShellTab(null);
        return;
      }

      setShellMountedTabs((prev) => {
        if (prev.has(tab)) return prev;
        const next = new Set(prev);
        next.add(tab);
        return next;
      });
      setShellTab(tab);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [nextPathname]);

  const openMainTab = useCallback(
    (href: MainTabHref) => {
      window.history.pushState({ sayittomeMainTab: true }, "", href);

      if (href === nextPathname) {
        setShellTab(null);
        return;
      }

      setShellMountedTabs((prev) => {
        if (prev.has(href)) return prev;
        const next = new Set(prev);
        next.add(href);
        return next;
      });
      setShellTab(href);
    },
    [nextPathname],
  );

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
      <div hidden={childrenHidden} aria-hidden={childrenHidden}>
        {children}
      </div>
      <MainTabShellPanels />
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
