"use client";

import Link from "next/link";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export default function ChatInboxLink({ href, className, children }: Props) {
  return (
    <Link href={href} prefetch className={className}>
      {children}
    </Link>
  );
}
