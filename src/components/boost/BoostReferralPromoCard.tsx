"use client";

import { Gift, Sparkles } from "lucide-react";

import { useLocale } from "@/contexts/LocaleContext";
import { getReferralRewardLabel } from "@/lib/boost/format";

export default function BoostReferralPromoCard() {
  const { t, locale } = useLocale();
  const reward = getReferralRewardLabel(locale);

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-orange-400/35 bg-gradient-to-br from-orange-500/20 via-[#160a04] to-black p-5 shadow-[0_12px_32px_rgba(249,115,22,0.14)]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-300">
          <Gift size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-300">
            {t("boost_referral_promo_badge")}
          </p>
          <p className="mt-2 text-[2rem] font-black leading-none tracking-tight text-white">
            {reward}
          </p>
          <p className="mt-1 text-sm font-bold text-orange-200/90">
            {t("boost_referral_promo_per_invite")}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm font-semibold leading-6 text-white/70">
        <li className="flex items-start gap-2">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-orange-300" />
          {t("boost_referral_promo_benefit_bank")}
        </li>
        <li className="flex items-start gap-2">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-orange-300" />
          {t("boost_referral_promo_benefit_shuffle")}
        </li>
        <li className="flex items-start gap-2">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-orange-300" />
          {t("boost_referral_promo_benefit_compare", { reward })}
        </li>
      </ul>
    </section>
  );
}
