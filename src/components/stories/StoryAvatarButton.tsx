"use client";

import { memo, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

import StoryRing from "@/components/stories/StoryRing";
import { useStoryStatus } from "@/hooks/useStoryStatus";
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
  onOpenProfile?: () => void;
  children?: ReactNode;
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
  onOpenProfile,
  children,
}: Props) {
  const router = useRouter();
  const status = useStoryStatus(ownerUid, username);

  useEffect(() => {
    if (status.hasActive) {
      prefetchOwnerStories(ownerUid, username);
    }
  }, [ownerUid, username, status.hasActive, status.storyCount]);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    const openStories = status.hasActive && status.hasUnseen && status.storyPath;

    if (openStories && !preferProfile) {
      event.preventDefault();
      event.stopPropagation();
      router.push(status.storyPath);
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

  const avatar = (
    <div
      className={[
        SIZE_CLASS[size],
        size === "hero" ? "" : "rounded-full overflow-hidden bg-[#242424] flex items-center justify-center",
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
      ) : children ? (
        children
      ) : (
        <UserRound size={iconSize} className="text-white/75" />
      )}
    </div>
  );

  const inner = status.hasActive ? <StoryRing active={status.hasUnseen}>{avatar}</StoryRing> : avatar;

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
        <div className="absolute bottom-1 right-1 h-6 w-6 rounded-full border-[3px] border-black bg-green-500" />
      ) : null}
    </button>
  );
}

export default memo(StoryAvatarButton);
