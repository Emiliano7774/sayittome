"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  onClick: () => void;
  ariaLabel: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary";
  variant?: "solid" | "glass";
  badge?: ReactNode;
  iconClassName?: string;
};

export default function ShuffleToolbarButton({
  onClick,
  ariaLabel,
  icon: Icon,
  tone = "neutral",
  variant = "solid",
  badge,
  iconClassName = "",
}: Props) {
  const toneClass =
    variant === "glass"
      ? tone === "primary"
        ? "sayittome-shuffle-glass-chip sayittome-shuffle-glass-chip-primary text-white"
        : "sayittome-shuffle-glass-chip text-white"
      : tone === "primary"
        ? "bg-violet-600 text-white"
        : "border border-white/10 bg-white/5 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 ${toneClass}`}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <Icon
          size={18}
          strokeWidth={2.35}
          className={`block shrink-0 ${iconClassName}`.trim()}
        />
      </span>
      {badge}
    </button>
  );
}
