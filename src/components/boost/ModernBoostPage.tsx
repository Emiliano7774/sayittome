"use client";

import { Copy, Sparkles } from "lucide-react";

import BoostAccessGate from "@/components/boost/BoostAccessGate";
import BoostRocketHero from "@/components/boost/BoostRocketHero";
import ModernPageHeader from "@/components/modern/ModernPageHeader";
import { useLocale } from "@/contexts/LocaleContext";
import { useBoostActions, formatBoostRemaining } from "@/hooks/useBoostActions";
import { BOOST_MINUTES_PER_ACTIVATION, BOOST_MINUTES_PER_REFERRAL } from "@/lib/boost/constants";

export default function ModernBoostPage() {
  const { t } = useLocale();
  const {
    accessState,
    canUseBoost,
    status,
    loading,
    activating,
    feedback,
    copied,
    credits,
    activeUntil,
    isActive,
    handleActivate,
    handleCopy,
  } = useBoostActions(true);

  return (
    <main data-scroll-root className="min-h-screen bg-black pb-32 text-white">
      <BoostRocketHero variant="modern" />

      <div className="relative z-[1] -mt-8 mx-auto w-full max-w-[1400px] px-4 md:px-8">
        <ModernPageHeader title={t("boost_title")} subtitle={t("boost_subtitle")} />

        {!canUseBoost ? (
          <BoostAccessGate state={accessState} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label={t("boost_credits_label")} value={loading && !status ? "…" : `${credits} min`} />
              <StatCard
                label={t("boost_active_label")}
                value={isActive && activeUntil ? formatBoostRemaining(activeUntil) : t("boost_inactive")}
              />
              <StatCard
                className="md:col-span-1 col-span-2"
                label={t("boost_referrals_stats", {
                  qualified: String(status?.referralsQualified ?? 0),
                  pending: String(status?.referralsPending ?? 0),
                })}
                value={t("boost_classic_promo_title")}
                compact
              />
            </div>

            <div className="rounded-[1.75rem] border border-orange-500/25 bg-orange-500/10 p-5">
              <p className="font-black text-orange-200">{t("boost_classic_promo_title")}</p>
              <p className="mt-2 text-sm leading-7 text-white/65">
                {t("boost_classic_promo_body", { minutes: String(BOOST_MINUTES_PER_REFERRAL) })}
              </p>
            </div>

            {status?.referralLink ? (
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-black uppercase tracking-wide text-white/45">
                  {t("boost_referral_link")}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">
                    {status.referralLink}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-orange-500 px-4 py-2 text-xs font-black text-black"
                  >
                    <Copy size={14} />
                    {copied ? t("boost_copied") : t("boost_copy")}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-white/65">
              <p className="font-black text-white">{t("boost_how_title")}</p>
              <p className="mt-2">{t("boost_how_body", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}</p>
              <p className="mt-2">{t("boost_referral_body", { minutes: String(BOOST_MINUTES_PER_REFERRAL) })}</p>
              <p className="mt-2 text-white/45">{t("boost_security_note")}</p>
            </div>

            {feedback ? <p className="text-center text-sm font-black text-orange-300">{feedback}</p> : null}

            <button
              type="button"
              disabled={activating || isActive || credits < BOOST_MINUTES_PER_ACTIVATION}
              onClick={() => void handleActivate()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-4 text-sm font-black text-black disabled:opacity-45"
            >
              <Sparkles size={16} />
              {activating
                ? t("common_preparing")
                : t("boost_activate_cta", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  compact = false,
  className = "",
}: {
  label: string;
  value: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 ${className}`}>
      <p className="text-xs font-black uppercase tracking-wide text-white/40">{label}</p>
      <p className={`mt-2 font-black text-orange-300 ${compact ? "text-sm leading-6" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
