"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  onClick: () => void;
  ariaLabel: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary";
  variant?: "solid" | "nav";
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
    variant === "nav"
      ? tone === "primary"
        ? "text-[#7b5cff]"
        : "text-[#777]"
      : tone === "primary"
        ? "bg-violet-600 text-white"
        : "border border-white/10 bg-white/5 text-white";

  const size = variant === "nav" && tone === "primary" ? 34 : variant === "nav" ? 22 : 18;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 ${toneClass}`}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <Icon
          size={size}
          strokeWidth={2.4}
          className={`block shrink-0 ${iconClassName}`.trim()}
        />
      </span>
      {badge}
    </button>
  );
}
