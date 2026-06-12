"use client";

import Link from "next/link";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  return (
    <Link href={href} className={className} prefetch {...rest}>
      {children}
    </Link>
  );
}
