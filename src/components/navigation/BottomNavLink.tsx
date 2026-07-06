"use client";

import Link from "next/link";

import { markMainTabVisited, pinMainTabKeepAlive } from "@/lib/navigation/mainTabKeepAlive";
import { isMainTabHref } from "@/lib/navigation/mainTabs";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

/** Main tabs navigate via real routes; keep-alive hosts preserve mounted panels. */
export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  function warmTab() {
    if (isMainTabHref(href)) {
      pinMainTabKeepAlive();
      markMainTabVisited(href);
    }
  }

  return (
    <Link
      href={href}
      className={className}
      prefetch
      onPointerDown={warmTab}
      onPointerEnter={warmTab}
      {...rest}
    >
      {children}
    </Link>
  );
}
