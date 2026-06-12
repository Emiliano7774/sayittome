"use client";

import Link from "next/link";

import { isNativeAppShell } from "@/lib/app/nativeShell";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  if (isNativeAppShell()) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} prefetch {...rest}>
      {children}
    </Link>
  );
}
