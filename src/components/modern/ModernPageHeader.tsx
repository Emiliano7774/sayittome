"use client";

import type { ReactNode } from "react";

import UxModeSwitcher from "@/components/UxModeSwitcher";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  showBadge?: boolean;
};

export default function ModernPageHeader({
  title,
  subtitle,
  actions,
  showBadge = true,
}: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-black tracking-[0.32em] text-white/55">SAYITTOME</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight md:text-[2.75rem]">{title}</h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm font-bold text-white/45 md:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {showBadge ? <UxModeSwitcher /> : null}
      </div>
    </header>
  );
}
