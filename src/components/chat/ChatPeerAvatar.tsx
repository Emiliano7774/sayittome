"use client";

import { useId } from "react";
import { UserRound } from "lucide-react";

import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import { classicAnonAvatarColor } from "@/lib/chat/anonAvatarStyle";

type Props = {
  photo?: string;
  username?: string;
  size?: "sm" | "md" | "lg";
  blurPhoto?: boolean;
  className?: string;
  variant?: "classic" | "modern";
  anonAvatar?: boolean;
  anonKey?: string;
  enablePhotoScan?: boolean;
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

function AnonPlaceholder({
  size,
  variant,
  anonKey,
}: {
  size: "sm" | "md" | "lg";
  variant: "classic" | "modern";
  anonKey: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const iconSize = ICON_SIZE[size];

  if (variant === "classic") {
    const bg = classicAnonAvatarColor(anonKey);

    return (
      <div
        className={`flex h-full w-full items-center justify-center ${SIZE_CLASS[size]}`}
        style={{ backgroundColor: bg }}
      >
        <UserRound size={iconSize} strokeWidth={1.85} className="text-white/92" />
      </div>
    );
  }

  return (
    <div
      className={[
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-black",
        "ring-1 ring-white/[0.14]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_22px_rgba(255,255,255,0.05)]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.16),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),transparent_42%,rgba(255,255,255,0.03))]" />

      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5f5f5" />
            <stop offset="45%" stopColor="#d4d4d4" />
            <stop offset="100%" stopColor="#737373" />
          </linearGradient>
        </defs>
      </svg>

      <UserRound
        size={iconSize}
        strokeWidth={1.85}
        stroke={`url(#${gradientId})`}
        className="relative z-[1] drop-shadow-[0_1px_8px_rgba(255,255,255,0.28)]"
      />
    </div>
  );
}

export default function ChatPeerAvatar({
  photo = "",
  username = "",
  size = "md",
  blurPhoto = false,
  className = "",
  variant = "modern",
  anonAvatar = false,
  anonKey = "",
  enablePhotoScan = true,
}: Props) {
  const showAnonAvatar = anonAvatar && !photo;
  const resolvedAnonKey = anonKey || username || "anon";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${SIZE_CLASS[size]} ${
        showAnonAvatar && variant === "modern" ? "bg-black" : "bg-[#141414]"
      } ${className}`}
    >
      {photo ? (
        <SensitiveMediaShell
          url={photo}
          staticRequiresBlur={blurPhoto}
          enableRuntimeScan={enablePhotoScan}
          className="h-full w-full"
        >
          <img
            src={photo}
            alt={username || "Perfil"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </SensitiveMediaShell>
      ) : showAnonAvatar ? (
        <AnonPlaceholder size={size} variant={variant} anonKey={resolvedAnonKey} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/30">
          <UserRound size={ICON_SIZE[size]} strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}
