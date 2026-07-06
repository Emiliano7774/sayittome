"use client";

import Link from "next/link";

import type { ParsedVerifiedProfileLink } from "@/lib/profile/verifiedLink";

type Props = {
  text: string;
  verifiedLink: ParsedVerifiedProfileLink | null;
  className?: string;
};

export default function ChatMessageText({ text, verifiedLink, className }: Props) {
  if (!verifiedLink) {
    return <p className={className}>{text}</p>;
  }

  const needle = verifiedLink.displayLink;
  const httpsNeedle = `https://${needle}`;
  const index = text.indexOf(httpsNeedle) >= 0
    ? text.indexOf(httpsNeedle)
    : text.indexOf(needle);

  if (index < 0) {
    return <p className={className}>{text}</p>;
  }

  const matched =
    index === text.indexOf(httpsNeedle) ? httpsNeedle : needle;
  const before = text.slice(0, index);
  const after = text.slice(index + matched.length);

  return (
    <p className={className}>
      {before}
      <Link
        href={verifiedLink.profileHref}
        prefetch
        className="font-bold underline decoration-violet-300/50 underline-offset-2"
      >
        {matched}
      </Link>
      {after}
    </p>
  );
}
