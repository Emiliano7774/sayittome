"use client";

import { UserRound } from "lucide-react";

type Props = {
  photo?: string;
  username?: string;
  size?: "sm" | "md" | "lg";
  blurPhoto?: boolean;
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-14 w-14",
} as const;

const ICON_SIZE = {
  sm: 18,
  md: 22,
  lg: 26,
} as const;

export default function ChatPeerAvatar({
  photo = "",
  username = "",
  size = "md",
  blurPhoto = false,
  className = "",
}: Props) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-[#141414] ${SIZE_CLASS[size]} ${className}`}
    >
      {photo ? (
        <img
          src={photo}
          alt={username || "Perfil"}
          loading="lazy"
          decoding="async"
          className={[
            "h-full w-full object-cover",
            blurPhoto ? "scale-110 blur-2xl" : "",
          ].join(" ")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/30">
          <UserRound size={ICON_SIZE[size]} strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}
