"use client";

import Link from "next/link";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { shouldHardNavigatePath } from "@/lib/navigation/hardNavigate";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
  prefetch?: boolean;
  onPointerDown?: React.PointerEventHandler<HTMLAnchorElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLAnchorElement>;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

/** Uses full-page navigation in the native APK for routes that often fail soft client transitions. */
export default function NativeAwareLink({
  href,
  className,
  children,
  prefetch,
  onPointerDown,
  onPointerEnter,
  onClick,
}: Props) {
  if (isNativeAppShell() && shouldHardNavigatePath(href)) {
    return (
      <a
        href={href}
        className={className}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      prefetch={prefetch}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
