"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";
import type { ParsedVerifiedProfileLink } from "@/lib/profile/verifiedLink";

type Props = {
  link: ParsedVerifiedProfileLink;
  mine?: boolean;
  isClassic?: boolean;
};

export default function ChatVerifiedProfileLinkCard({
  link,
  mine = false,
  isClassic = false,
}: Props) {
  const t = useT();

  return (
    <Link
      href={link.profileHref}
      prefetch
      className={[
        "mt-1.5 flex max-w-[min(82vw,20rem)] items-center gap-2.5 border transition active:scale-[0.98]",
        mine ? "ml-auto" : "mr-auto",
        isClassic
          ? "rounded-lg border-violet-400/35 bg-violet-500/12 px-3 py-2.5 shadow-[0_0_18px_rgba(139,92,246,0.18)]"
          : "rounded-2xl border-violet-400/30 bg-violet-500/10 px-3.5 py-3",
      ].join(" ")}
      aria-label={t("chat_verified_link_open", { username: link.username })}
    >
      <span
        className={[
          "flex shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-200",
          isClassic ? "h-8 w-8" : "h-9 w-9",
        ].join(" ")}
      >
        <BadgeCheck size={isClassic ? 16 : 18} />
      </span>

      <span className="min-w-0">
        <span
          className={[
            "block font-black uppercase tracking-[0.14em] text-violet-200/90",
            isClassic ? "text-[10px]" : "text-[11px]",
          ].join(" ")}
        >
          {t("chat_verified_link_badge")}
        </span>
        <span
          className={[
            "block truncate font-bold text-white/85",
            isClassic ? "text-sm" : "text-[15px]",
          ].join(" ")}
        >
          @{link.username}
        </span>
        <span
          className={[
            "block truncate text-white/40",
            isClassic ? "text-[11px]" : "text-xs",
          ].join(" ")}
        >
          {link.displayLink}
        </span>
      </span>
    </Link>
  );
}
