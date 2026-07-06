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

function readStoredUxMode(): UxMode {
  if (typeof window === "undefined") return "classic";

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "classic" || saved === "modern") return saved;
  } catch {
    // Ignore storage errors during hydration edge cases.
  }

  return "classic";
}

export function UxModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [uxMode, setUxModeState] = useState<UxMode>(() => readStoredUxMode());

  useEffect(() => {
    const saved = readStoredUxMode();
    setUxModeState((current) => (current === saved ? current : saved));
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
