"use client";

import { memo, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

import StoryRing from "@/components/stories/StoryRing";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { classicAnonAvatarColor } from "@/lib/chat/anonAvatarStyle";
import { prefetchOwnerStories } from "@/lib/stories/storiesIndexStore";

type Size = "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "hero";

const SIZE_CLASS: Record<Size, string> = {
  "2xs": "w-8 h-8",
  xs: "w-10 h-10",
  sm: "w-12 h-12",
  md: "w-16 h-16",
  lg: "w-28 h-28 md:w-32 md:h-32",
  xl: "w-40 h-40 md:w-44 md:h-44",
  hero: "w-full h-full",
};

/** Avatar edge length in px — used to scale the online badge. */
const AVATAR_PX: Record<Size, number> = {
  "2xs": 32,
  xs: 40,
  sm: 48,
  md: 64,
  lg: 112,
  xl: 168,
  hero: 64,
};

function getOnlineBadgeStyle(size: Size) {
  const avatarPx = AVATAR_PX[size];
  const dotPx = Math.max(5, Math.round(avatarPx * 0.19));
  const borderPx = Math.max(1, Math.round(dotPx * 0.22));

  return {
    width: dotPx,
    height: dotPx,
    borderWidth: borderPx,
    bottom: Math.max(1, Math.round(dotPx * 0.12)),
    right: Math.max(1, Math.round(dotPx * 0.12)),
  };
}

type Props = {
  ownerUid?: string;
  username: string;
  photo?: string;
  size?: Size;
  /** shuffle: delega data-action al padre; profile: maneja click acá */
  mode?: "navigate" | "delegate";
  blurPhoto?: boolean;
  showOnline?: boolean;
  className?: string;
  iconSize?: number;
  /** En chat/perfil: abrir perfil aunque haya historias activas. */
  preferProfile?: boolean;
  /** Colored anon placeholder when the peer has no profile photo. */
  anonAvatar?: boolean;
  anonKey?: string;
  onOpenProfile?: () => void;
  children?: ReactNode;
  avatarOverlay?: ReactNode;
};

function StoryAvatarButton({
  ownerUid = "",
  username,
  photo = "",
  size = "lg",
  mode = "navigate",
  blurPhoto = false,
  showOnline = false,
  className = "",
  iconSize = 64,
  preferProfile = false,
  anonAvatar = false,
  anonKey = "",
  onOpenProfile,
  children,
  avatarOverlay,
}: Props) {
  const router = useRouter();
  const status = useStoryStatus(ownerUid, username);
  const showAnonAvatar = anonAvatar && !photo;
  const resolvedAnonKey = anonKey || username || "anon";

  useEffect(() => {
    if (status.hasActive) {
      prefetchOwnerStories(ownerUid, username);
    }
  }, [ownerUid, username, status.hasActive, status.storyCount]);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    const storyPath =
      status.hasActive && status.hasUnseen && status.storyPath
        ? status.storyPath
        : null;

    if (storyPath && !preferProfile) {
      event.preventDefault();
      event.stopPropagation();
      router.push(storyPath);
      return;
    }

    if (mode === "navigate") {
      event.preventDefault();
      event.stopPropagation();
      if (onOpenProfile) {
        onOpenProfile();
      } else {
        router.push(`/u/${encodeURIComponent(username)}`);
      }
    }
  }

  const openStories = status.hasActive && status.hasUnseen;
  const dataAction = openStories ? "story" : "profile";
  const onlineBadge = getOnlineBadgeStyle(size);

  const avatar = (
    <div
      className={[
        SIZE_CLASS[size],
        size === "hero" ? "" : "relative rounded-full overflow-hidden bg-[#242424] flex items-center justify-center",
      ].join(" ")}
    >
      {photo ? (
        <img
          src={photo}
          alt={username}
          loading="lazy"
          decoding="async"
          fetchPriority={size === "lg" ? "low" : "auto"}
          className={[
            "h-full w-full object-cover",
            blurPhoto ? "blur-2xl scale-110" : "",
          ].join(" ")}
        />
      ) : showAnonAvatar ? (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ backgroundColor: classicAnonAvatarColor(resolvedAnonKey) }}
        >
          <UserRound size={iconSize} strokeWidth={1.85} className="text-white/92" />
        </div>
      ) : children ? (
        children
      ) : (
        <UserRound size={iconSize} className="text-white/75" />
      )}
      {avatarOverlay}
    </div>
  );

  const inner = status.hasActive ? (
    <StoryRing active={status.hasUnseen}>{avatar}</StoryRing>
  ) : (
    avatar
  );

  return (
    <button
      type="button"
      data-action={mode === "delegate" ? dataAction : undefined}
      data-username={mode === "delegate" ? username : undefined}
      data-owner-uid={mode === "delegate" ? ownerUid : undefined}
      onClick={handleClick}
      className={[
        "relative shrink-0 active:scale-95 transition",
        className,
      ].join(" ")}
      aria-label={
        openStories
          ? `Ver historias de ${username}`
          : `Abrir perfil de ${username}`
      }
    >
      {inner}

      {showOnline ? (
        <div
          className="absolute rounded-full border-black bg-green-500"
          style={{
            width: onlineBadge.width,
            height: onlineBadge.height,
            borderWidth: onlineBadge.borderWidth,
            borderStyle: "solid",
            bottom: onlineBadge.bottom,
            right: onlineBadge.right,
          }}
        />
      ) : null}
    </button>
  );
}

export default memo(StoryAvatarButton);
