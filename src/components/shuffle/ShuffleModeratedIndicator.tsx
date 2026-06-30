"use client";

import { EyeOff } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { isShuffleProfileModerated } from "@/lib/shuffle/resolveShuffleBlur";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type Props = {
  profile: ShuffleProfile;
  variant?: "classic" | "modern";
};

export default function ShuffleModeratedIndicator({
  profile,
  variant = "classic",
}: Props) {
  const { ready, isAdmin } = useAdminSession();

  if (!isShuffleProfileModerated(profile)) return null;

  const modern = variant === "modern";

  if (modern) {
    return (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] rounded-[2.5rem] bg-black/30"
        />
        {ready && isAdmin ? (
          <span
            className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center"
            title="Perfil moderado"
            aria-label="Perfil moderado"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/75 backdrop-blur-sm">
              <EyeOff size={16} strokeWidth={2.2} />
            </span>
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-full bg-black/40"
      />
      {ready && isAdmin ? (
        <span
          className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center"
          title="Perfil moderado"
          aria-label="Perfil moderado"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/35 bg-black/75 text-violet-100/90 backdrop-blur-sm">
            <EyeOff size={14} strokeWidth={2.2} />
          </span>
        </span>
      ) : null}
    </>
  );
}
