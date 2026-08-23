"use client";

import Link from "next/link";

import {
  rememberChatBeforeOfficialProfileOpen,
  type ParsedVerifiedProfileLink,
} from "@/lib/profile/verifiedLink";

type Props = {
  text: string;
  verifiedLink: ParsedVerifiedProfileLink | null;
  className?: string;
};

export default function ChatMessageText({ text, verifiedLink, className }: Props) {
  if (!verifiedLink) {
    return <p className={className}>{text}</p>;
  }

  return (
    <p className={className}>
      <Link
        href={verifiedLink.profileHref}
        prefetch
        data-official-profile-link-url="1"
        onClick={rememberChatBeforeOfficialProfileOpen}
        className="inline-flex min-h-11 max-w-full items-center break-all font-bold underline decoration-violet-300/50 underline-offset-2"
      >
        {verifiedLink.matchedText || text.trim()}
      </Link>
    </p>
  );
}
