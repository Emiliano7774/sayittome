"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  active?: boolean;
};

/** Fixed dock above bottom nav; stays inside the boost page so tab switches hide it. */
export default function BoostStickyCtaBar({ children, active = true }: Props) {
  if (!active) return null;

  return (
    <div className="sayittome-boost-sticky-shell" role="region" aria-label="Boost actions">
      <div className="sayittome-boost-sticky-shell-inner">{children}</div>
    </div>
  );
}
