"use client";

import Link from "next/link";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { hardNavigate, shouldHardNavigatePath } from "@/lib/navigation/hardNavigate";
import { hasPendingChatSends } from "@/lib/chat/pendingChatSends";

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
    const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!hasPendingChatSends()) return;

      event.preventDefault();
      hardNavigate(href);
    };

    return (
      <a
        href={href}
        className={className}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onClick={handleClick}
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
