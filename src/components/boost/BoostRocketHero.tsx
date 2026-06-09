"use client";

import { Cloud, Rocket, Sparkles } from "lucide-react";

type Props = {
  variant?: "classic" | "modern";
};

export default function BoostRocketHero({ variant = "classic" }: Props) {
  const skyClass =
    variant === "classic"
      ? "from-orange-500 via-orange-600 to-orange-950"
      : "from-orange-500/90 via-amber-600/80 to-zinc-950";

  return (
    <div
      className={`relative h-[min(44vh,340px)] w-full overflow-hidden bg-gradient-to-b ${skyClass}`}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0">
        {[
          { top: "12%", left: "18%", size: 3 },
          { top: "22%", left: "72%", size: 2 },
          { top: "8%", left: "55%", size: 2.5 },
          { top: "30%", left: "40%", size: 2 },
          { top: "16%", left: "85%", size: 2 },
        ].map((star, index) => (
          <Sparkles
            key={index}
            size={star.size * 4}
            className="absolute text-white/35"
            style={{ top: star.top, left: star.left }}
          />
        ))}
      </div>

      <Cloud
        size={72}
        strokeWidth={1.5}
        className="absolute bottom-[38%] left-[8%] text-white/25"
      />
      <Cloud
        size={96}
        strokeWidth={1.5}
        className="absolute bottom-[42%] right-[6%] text-white/20"
      />
      <Cloud
        size={56}
        strokeWidth={1.5}
        className="absolute bottom-[48%] left-[38%] text-white/15"
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-2">
        <div className="relative mb-[-12px] flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-white via-orange-100 to-orange-200 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <Rocket
            size={52}
            strokeWidth={1.75}
            className="-rotate-45 text-orange-600 drop-shadow-sm"
          />
        </div>
        <div className="h-16 w-[88%] max-w-sm rounded-[100%] bg-black/55 blur-2xl" />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black via-black/80 to-transparent" />
    </div>
  );
}
