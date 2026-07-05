"use client";

import Link from "next/link";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

/** Main tabs navigate via real routes; keep-alive hosts preserve mounted panels. */
export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  return (
    <Link href={href} className={className} prefetch {...rest}>
      {children}
    </Link>
  );
}
