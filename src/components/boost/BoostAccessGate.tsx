"use client";

import Link from "next/link";
import { LogIn, Rocket, UserPlus } from "lucide-react";

import { useLocale } from "@/contexts/LocaleContext";
import type { BoostAccessState } from "@/lib/boost/boostEligibility";

type Props = {
  state: BoostAccessState;
};

export default function BoostAccessGate({ state }: Props) {
  const { t } = useLocale();

  if (state === "loading") {
    return (
      <div
        data-boost-access-state="loading"
        data-nav-loading-copy="1"
        className="mt-8 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-8 text-center"
      >
        <p className="text-lg font-black text-white/45">{t("common_loading")}</p>
      </div>
    );
  }

  if (state === "guest") {
    return (
      <div
        data-boost-access-state="guest"
        className="mt-8 overflow-hidden rounded-[1.35rem] border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-[#120804] to-black p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-300">
            <Rocket size={24} />
          </div>
          <div>
            <p className="text-xl font-black text-white">{t("boost_guest_title")}</p>
            <p className="mt-3 text-sm font-semibold leading-7 text-white/65">{t("boost_guest_body")}</p>
            <p className="mt-3 text-sm font-semibold leading-7 text-white/45">{t("boost_guest_note")}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <Link
            href="/register"
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 text-base font-black text-black"
          >
            <UserPlus size={18} />
            {t("profile_gate_register")}
          </Link>
          <Link
            href="/login"
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] text-base font-black text-white/85"
          >
            <LogIn size={18} />
            {t("profile_gate_login")}
          </Link>
          <Link
            href="/shuffle"
            className="block py-2 text-center text-sm font-bold text-white/40"
          >
            {t("profile_gate_back_shuffle")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-boost-access-state={state}
      className="mt-8 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-6"
    >
      <p className="text-xl font-black text-white">{t("boost_profile_required_title")}</p>
      <p className="mt-3 text-sm font-semibold leading-7 text-white/65">{t("boost_profile_required_body")}</p>
      <Link
        href="/register/setup"
        className="mt-6 flex h-14 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-400 text-base font-black text-black"
      >
        {t("boost_profile_required_cta")}
      </Link>
    </div>
  );
}
