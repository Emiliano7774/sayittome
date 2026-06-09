"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  children: ReactNode;
};

/** Fixed dock above bottom nav; portaled to body so scroll never moves it. */
export default function BoostStickyCtaBar({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="sayittome-boost-sticky-shell" role="region" aria-label="Boost actions">
      <div className="sayittome-boost-sticky-shell-inner">{children}</div>
    </div>,
    document.body,
  );
}
