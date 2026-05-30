"use client";

import { usePathname } from "next/navigation";

import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import { useT } from "@/contexts/LocaleContext";

export default function AnonMatchSearchingBanner() {
  const match = useAnonMatchOptional();
  const pathname = usePathname();
  const t = useT();

  if (!match?.searchSessionActive || match.phase === "accepted") return null;
  if (pathname.startsWith("/shuffle")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[115] flex justify-center px-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-[#111]/95 px-4 py-2 text-sm font-black text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
        {t("anon_match_searching")}
      </div>
    </div>
  );
}
