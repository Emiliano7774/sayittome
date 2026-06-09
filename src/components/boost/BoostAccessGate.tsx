"use client";

import Link from "next/link";

import { useLocale } from "@/contexts/LocaleContext";
import type { BoostAccessState } from "@/lib/boost/boostEligibility";

type Props = {
  state: BoostAccessState;
};

export default function BoostAccessGate({ state }: Props) {
  const { t } = useLocale();

  if (state === "loading") {
    return (
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <p className="text-base font-bold text-white/50">{t("common_loading")}</p>
      </div>
    );
  }

  if (state === "guest") {
    return (
      <div className="mt-8 space-y-4 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-6">
        <p className="text-lg font-black text-orange-200">{t("boost_guest_title")}</p>
        <p className="text-sm font-semibold leading-7 text-white/70">{t("boost_guest_body")}</p>
        <Link
          href="/register"
          className="block w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-4 text-center text-lg font-black text-black"
        >
          {t("profile_gate_register")}
        </Link>
        <Link
          href="/login"
          className="block w-full rounded-full border border-white/15 py-4 text-center text-lg font-black text-white/80"
        >
          {t("profile_gate_login")}
        </Link>
        <Link
          href="/shuffle"
          className="block w-full py-2 text-center text-sm font-bold text-white/45"
        >
          {t("profile_gate_back_shuffle")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <p className="text-lg font-black text-white">{t("boost_profile_required_title")}</p>
      <p className="text-sm font-semibold leading-7 text-white/65">{t("boost_profile_required_body")}</p>
      <Link
        href="/register/setup"
        className="block w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-4 text-center text-lg font-black text-black"
      >
        {t("boost_profile_required_cta")}
      </Link>
    </div>
  );
}
