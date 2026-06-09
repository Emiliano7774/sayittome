"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BoostModalContextValue = {
  open: boolean;
  openBoostModal: () => void;
  closeBoostModal: () => void;
};

const BoostModalContext = createContext<BoostModalContextValue | null>(null);

export function BoostModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openBoostModal = useCallback(() => setOpen(true), []);
  const closeBoostModal = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openBoostModal, closeBoostModal }),
    [open, openBoostModal, closeBoostModal],
  );

  return (
    <BoostModalContext.Provider value={value}>{children}</BoostModalContext.Provider>
  );
}

export function useBoostModal() {
  const ctx = useContext(BoostModalContext);
  if (!ctx) {
    throw new Error("useBoostModal must be used within BoostModalProvider");
  }
  return ctx;
}
