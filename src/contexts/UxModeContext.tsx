"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type UxMode = "modern" | "classic";

type UxModeContextValue = {
  uxMode: UxMode;
  setUxMode: (mode: UxMode) => void;
  toggleUxMode: () => void;
};

const UxModeContext = createContext<UxModeContextValue | null>(null);

const STORAGE_KEY = "sayittome_ux_mode";

export function UxModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [uxMode, setUxModeState] = useState<UxMode>("modern");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);

      if (saved === "classic" || saved === "modern") {
        setUxModeState(saved);
      }
    } catch {
      setUxModeState("modern");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, uxMode);
      document.documentElement.setAttribute("data-ux", uxMode);
      document.body.setAttribute("data-ux", uxMode);
    } catch {
      // Ignore storage/document errors during hydration edge cases.
    }
  }, [uxMode]);

  const setUxMode = (mode: UxMode) => {
    setUxModeState(mode);
  };

  const toggleUxMode = () => {
    setUxModeState((current) =>
      current === "classic" ? "modern" : "classic"
    );
  };

  const value = useMemo<UxModeContextValue>(
    () => ({
      uxMode,
      setUxMode,
      toggleUxMode,
    }),
    [uxMode]
  );

  return (
    <UxModeContext.Provider value={value}>
      {children}
    </UxModeContext.Provider>
  );
}

export function useUxMode() {
  const context = useContext(UxModeContext);

  if (!context) {
    throw new Error("useUxMode must be used inside UxModeProvider");
  }

  return context;
}
