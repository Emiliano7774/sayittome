"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";
import {
  rememberChatBeforeOfficialProfileOpen,
  type ParsedVerifiedProfileLink,
} from "@/lib/profile/verifiedLink";

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
      data-official-profile-link-row="1"
      onClick={rememberChatBeforeOfficialProfileOpen}
      className={[
        "mt-1 flex min-h-11 max-w-[min(82vw,20rem)] items-center gap-2 border px-3 transition active:scale-[0.98]",
        mine ? "ml-auto" : "mr-auto",
        isClassic
          ? "rounded-lg border-violet-400/35 bg-violet-500/12"
          : "rounded-2xl border-violet-400/30 bg-violet-500/10",
      ].join(" ")}
      aria-label={t("chat_verified_link_open", { username: link.username })}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-200">
        <BadgeCheck size={16} />
      </span>
      <span className="min-w-0 truncate text-sm font-bold text-violet-100">
        {t("chat_verified_link_badge")}
      </span>
    </Link>
  );
}
