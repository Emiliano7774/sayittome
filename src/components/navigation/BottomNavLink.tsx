"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { useMainTabShell } from "@/contexts/MainTabShellContext";
import type { MainTabHref } from "@/lib/navigation/mainTabs";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

export default function BottomNavLink({ href, className, children, ...rest }: Props) {
  const { openMainTab, isMainTabHref } = useMainTabShell();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isMainTabHref(href)) return;
    event.preventDefault();
    openMainTab(href as MainTabHref);
  }

  return (
    <Link href={href} className={className} prefetch onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
