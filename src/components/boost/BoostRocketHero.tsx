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
      className={`relative h-[min(40vh,300px)] w-full overflow-hidden bg-gradient-to-b ${skyClass}`}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0">
        {[
          { top: "10%", left: "14%", size: 3 },
          { top: "18%", left: "68%", size: 2 },
          { top: "6%", left: "48%", size: 2.5 },
          { top: "26%", left: "36%", size: 2 },
          { top: "12%", left: "82%", size: 2 },
        ].map((star, index) => (
          <Sparkles
            key={index}
            size={star.size * 4}
            className="absolute text-white/30"
            style={{ top: star.top, left: star.left }}
          />
        ))}
      </div>

      <Cloud size={68} strokeWidth={1.5} className="absolute bottom-[36%] left-[6%] text-white/20" />
      <Cloud size={88} strokeWidth={1.5} className="absolute bottom-[40%] right-[4%] text-white/15" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
        <div className="relative mb-[-10px] flex h-[104px] w-[104px] items-center justify-center rounded-full bg-gradient-to-br from-white via-orange-50 to-orange-200 shadow-[0_20px_48px_rgba(0,0,0,0.4)] ring-4 ring-orange-300/30">
          <Rocket
            size={48}
            strokeWidth={1.85}
            className="-rotate-45 text-orange-600 drop-shadow-sm"
          />
        </div>
        <div className="h-14 w-[78%] max-w-xs rounded-[100%] bg-black/60 blur-2xl" />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/85 to-transparent" />
    </div>
  );
}
