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
}: Props) {
  const t = useT();

  return (
    <Link
      href={link.profileHref}
      prefetch
      data-official-profile-link-row="1"
      onClick={rememberChatBeforeOfficialProfileOpen}
      className="relative mt-0.5 ml-auto inline-flex min-h-11 min-w-11 items-center justify-end"
      aria-label={t("chat_verified_link_open", { username: link.username })}
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-200">
        <BadgeCheck size={14} />
        {t("chat_verified_link_badge")}
      </span>
    </Link>
  );
}
