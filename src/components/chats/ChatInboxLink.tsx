"use client";

import Link from "next/link";

import { hardNavigate, shouldHardNavigate } from "@/lib/navigation/hardNavigate";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export default function ChatInboxLink({ href, className, children }: Props) {
  if (shouldHardNavigate()) {
    return (
      <a
        href={href}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          hardNavigate(href);
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} prefetch className={className}>
      {children}
    </Link>
  );
}
