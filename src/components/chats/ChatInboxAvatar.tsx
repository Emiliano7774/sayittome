"use client";

import { UserRound } from "lucide-react";

import { classicAnonAvatarColor } from "@/lib/chat/anonAvatarStyle";

type Props = {
  photo?: string;
  username?: string;
  size?: "sm" | "md" | "lg";
  blurPhoto?: boolean;
  variant?: "classic" | "modern";
  anonAvatar?: boolean;
  anonKey?: string;
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

export default function ChatInboxAvatar({
  photo = "",
  username = "",
  size = "md",
  blurPhoto = false,
  variant = "modern",
  anonAvatar = false,
  anonKey = "",
}: Props) {
  const showAnonAvatar = anonAvatar && !photo;
  const resolvedAnonKey = anonKey || username || "anon";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${SIZE_CLASS[size]} ${
        showAnonAvatar && variant === "modern" ? "bg-black" : "bg-[#141414]"
      }`}
    >
      {photo ? (
        <img
          src={photo}
          alt={username || "Perfil"}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${blurPhoto ? "scale-110 blur-2xl" : ""}`}
        />
      ) : showAnonAvatar ? (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            backgroundColor:
              variant === "classic" ? classicAnonAvatarColor(resolvedAnonKey) : "#111",
          }}
        >
          <UserRound size={ICON_SIZE[size]} strokeWidth={1.85} className="text-white/92" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/30">
          <UserRound size={ICON_SIZE[size]} strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}
