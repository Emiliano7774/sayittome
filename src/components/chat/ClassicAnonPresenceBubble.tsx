"use client";

import { EyeOff } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  session: string;
};

export default function ClassicAnonPresenceBubble({ session }: Props) {
  const t = useT();

  return (
    <div className="relative mt-10 w-full max-w-[320px]">
      <div
        aria-hidden
        className="absolute -top-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-l border-t border-white/10 bg-[#060606]"
      />

      <div className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#060606] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,.65)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="h-px w-[130%] -rotate-[22deg] bg-white/10" />
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 text-white/[0.06]"
        >
          <EyeOff size={52} strokeWidth={1.25} />
        </div>

        <p className="relative text-[11px] font-black uppercase tracking-[0.32em] text-violet-400/75">
          {t("chat_anon_classic_tag")}
        </p>

        <p className="relative mt-2 text-lg font-black tracking-[-0.03em] text-white/92">
          {t("chat_anon_classic_invisible")}
        </p>

        <p className="relative mt-2 text-sm leading-6 text-white/38">
          {t("chat_anon_classic_body")}
        </p>

        <p className="relative mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-white/22">
          {t("chat_anon_you_are", { session })}
        </p>
      </div>
    </div>
  );
}
