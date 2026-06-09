"use client";

import Link from "next/link";
import { Copy, Gauge, Gift, Sparkles, Wallet } from "lucide-react";

import BoostAccessGate from "@/components/boost/BoostAccessGate";
import BoostRocketHero from "@/components/boost/BoostRocketHero";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { useLocale } from "@/contexts/LocaleContext";
import { useBoostActions, formatBoostRemaining } from "@/hooks/useBoostActions";
import { BOOST_MINUTES_PER_ACTIVATION, BOOST_MINUTES_PER_REFERRAL } from "@/lib/boost/constants";

export default function ClassicBoostPage() {
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
    <main data-scroll-root className="min-h-screen bg-black pb-36 text-white">
      <BoostRocketHero variant="classic" />

      <div className="relative z-[1] -mt-6 px-5">
        <ClassicUxModeBar className="mb-5" />

        <h1 className="text-[2rem] font-black leading-tight tracking-[-0.03em] md:text-5xl">
          {t("boost_classic_headline")}
        </h1>
        <p className="mt-3 max-w-xl text-lg font-bold leading-7 text-white/55">
          {t("boost_classic_subheadline")}
        </p>

        {!canUseBoost ? (
          <BoostAccessGate state={accessState} />
        ) : (
          <>
            <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-4 shadow-[0_12px_30px_rgba(249,115,22,0.28)]">
              <p className="text-lg font-black text-white">{t("boost_classic_promo_title")}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-white/90">
                {t("boost_classic_promo_body", { minutes: String(BOOST_MINUTES_PER_REFERRAL) })}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <BoostPlanCard
                label={t("boost_card_wallet")}
                value={loading && !status ? "…" : `${credits}`}
                suffix={t("boost_minutes_short")}
                icon={Wallet}
                muted
              />
              <BoostPlanCard
                label={t("boost_card_activate")}
                value={String(BOOST_MINUTES_PER_ACTIVATION)}
                suffix={t("boost_minutes_short")}
                icon={Gauge}
                badge={t("boost_card_recommended")}
                selected
              />
              <BoostPlanCard
                label={t("boost_card_referral")}
                value={`+${BOOST_MINUTES_PER_REFERRAL}`}
                suffix={t("boost_minutes_short")}
                icon={Gift}
                muted
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-black uppercase tracking-wide text-white/40">
                  {t("boost_active_label")}
                </p>
                <p className="mt-2 text-xl font-black text-orange-300">
                  {isActive && activeUntil
                    ? formatBoostRemaining(activeUntil)
                    : t("boost_inactive")}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-black uppercase tracking-wide text-white/40">
                  {t("boost_referrals_stats", {
                    qualified: String(status?.referralsQualified ?? 0),
                    pending: String(status?.referralsPending ?? 0),
                  })}
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-white/55">
                  {t("boost_security_note_short")}
                </p>
              </div>
            </div>

            {status?.referralLink ? (
              <div className="mt-6 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-orange-200/80">
                  {t("boost_referral_link")}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-white/85">
                    {status.referralLink}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-xs font-black text-black"
                  >
                    <Copy size={14} />
                    {copied ? t("boost_copied") : t("boost_copy")}
                  </button>
                </div>
              </div>
            ) : null}

            <section className="mt-8 space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <p className="flex items-center gap-2 text-base font-black text-orange-200">
                <Sparkles size={18} />
                {t("boost_how_title")}
              </p>
              <p className="text-sm font-semibold leading-7 text-white/60">
                {t("boost_how_body", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}
              </p>
              <p className="text-sm font-semibold leading-7 text-white/60">
                {t("boost_referral_body", { minutes: String(BOOST_MINUTES_PER_REFERRAL) })}
              </p>
            </section>

            {feedback ? (
              <p className="mt-5 text-center text-base font-black text-orange-300">{feedback}</p>
            ) : null}

            <p className="mt-8 pb-4 text-center text-[11px] leading-5 text-white/35">
              {t("boost_fine_print")}
            </p>
          </>
        )}
      </div>

      {canUseBoost ? (
        <div className="fixed inset-x-0 bottom-[88px] z-20 px-5">
          <button
            type="button"
            disabled={activating || isActive || credits < BOOST_MINUTES_PER_ACTIVATION}
            onClick={() => void handleActivate()}
            className="w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-4 text-lg font-black text-black shadow-[0_12px_32px_rgba(249,115,22,0.35)] disabled:opacity-45"
          >
            {activating
              ? t("common_preparing")
              : t("boost_activate_cta", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}
          </button>
        </div>
      ) : null}
    </main>
  );
}

function BoostPlanCard({
  label,
  value,
  suffix,
  icon: Icon,
  badge,
  selected = false,
  muted = false,
}: {
  label: string;
  value: string;
  suffix: string;
  icon: typeof Wallet;
  badge?: string;
  selected?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "relative flex min-h-[148px] flex-col rounded-2xl border px-3 py-4",
        selected
          ? "border-orange-400 bg-orange-500/10 shadow-[0_0_0_1px_rgba(251,146,60,0.35)]"
          : "border-white/12 bg-white/[0.03]",
        muted ? "opacity-90" : "",
      ].join(" ")}
    >
      {badge ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">
          {badge}
        </span>
      ) : null}
      <p className="mt-1 text-center text-[11px] font-black uppercase tracking-wide text-white/45">
        {label}
      </p>
      <p className="mt-2 text-center text-2xl font-black leading-none text-white">{value}</p>
      <p className="text-center text-xs font-bold text-white/45">{suffix}</p>
      <div className="mt-auto flex justify-center pt-3 text-orange-300/80">
        <Icon size={22} strokeWidth={1.75} />
      </div>
    </div>
  );
}
