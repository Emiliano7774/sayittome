"use client";

import { useEffect } from "react";
import {
  CheckCircle2,
  Copy,
  Rocket,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";

import BoostAccessGate from "@/components/boost/BoostAccessGate";
import BoostMinutesPicker from "@/components/boost/BoostMinutesPicker";
import BoostReferralPromoCard from "@/components/boost/BoostReferralPromoCard";
import BoostRocketHero from "@/components/boost/BoostRocketHero";
import BoostStickyCtaBar from "@/components/boost/BoostStickyCtaBar";
import ClassicUxModeBar from "@/components/classic/ClassicUxModeBar";
import { useMainTabRouteActive } from "@/contexts/MainTabShellContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useBoostActions, formatBoostRemaining } from "@/hooks/useBoostActions";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { BOOST_MIN_MINUTES, BOOST_MINUTES_PER_ACTIVATION } from "@/lib/boost/constants";
import { getReferralRewardLabel } from "@/lib/boost/format";

export default function ClassicBoostPage() {
  const boostActive = useMainTabRouteActive("/boost");
  const { t, locale } = useLocale();
  const referralReward = getReferralRewardLabel(locale);
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
    selectedMinutes,
    setSelectedMinutes,
    handleActivate,
    handleCopy,
  } = useBoostActions(true);

  const canActivate =
    credits >= BOOST_MIN_MINUTES &&
    selectedMinutes >= BOOST_MIN_MINUTES &&
    selectedMinutes <= credits &&
    !isActive &&
    !activating;

  useEffect(() => {
    if (!boostActive) return;
    document.body.classList.add("sayittome-boost-route");
    return () => {
      document.body.classList.remove("sayittome-boost-route");
    };
  }, [boostActive]);

  useNavUsefulPaint(boostActive && !loading, "/boost");

  return (
    <main data-scroll-root className="sayittome-boost-page min-h-screen bg-black text-white">
      <BoostRocketHero variant="classic" />

      <div className="relative z-[1] -mt-8 px-5">
        <ClassicUxModeBar className="mb-4" />

        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
          {t("boost_classic_badge")}
        </p>
        <h1 className="mt-2 text-[2.15rem] font-black leading-[1.05] tracking-[-0.03em] md:text-5xl">
          {t("boost_classic_headline")}
        </h1>
        <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-white/55 md:text-lg">
          {t("boost_classic_subheadline", { reward: referralReward })}
        </p>

        {!canUseBoost ? (
          <BoostAccessGate state={accessState} />
        ) : (
          <div className="mt-8 space-y-6">
            <section className="overflow-hidden rounded-[1.35rem] border border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-[#140a04] to-black p-5 shadow-[0_16px_40px_rgba(249,115,22,0.12)]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300/80">
                {t("boost_classic_status_title")}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-bold text-white/45">{t("boost_credits_label")}</p>
                  <p className="mt-1 text-4xl font-black tabular-nums text-white">
                    {loading && !status ? "…" : credits}
                  </p>
                  <p className="mt-1 text-sm font-bold text-orange-200/80">
                    {t("boost_minutes_short")}
                  </p>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <p className="text-sm font-bold text-white/45">{t("boost_active_label")}</p>
                  <p className="mt-1 text-2xl font-black leading-tight text-orange-300">
                    {isActive && activeUntil
                      ? formatBoostRemaining(activeUntil)
                      : t("boost_inactive")}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/40">
                    {isActive
                      ? t("boost_classic_active_hint")
                      : t("boost_classic_inactive_hint")}
                  </p>
                </div>
              </div>

              <p className="mt-4 rounded-xl bg-black/35 px-4 py-3 text-sm font-semibold leading-6 text-white/65">
                {t("boost_classic_cost_note_flexible")}
              </p>
            </section>

            <BoostReferralPromoCard />

            {credits >= BOOST_MIN_MINUTES ? (
              <section className="hidden rounded-[1.35rem] border border-orange-500/20 bg-orange-500/5 p-5 lg:block">
                <BoostMinutesPicker
                  credits={credits}
                  value={selectedMinutes}
                  onChange={setSelectedMinutes}
                  disabled={isActive || activating}
                />
              </section>
            ) : null}

            <section>
              <h2 className="text-xl font-black text-white">{t("boost_classic_steps_title")}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-white/45">
                {t("boost_classic_steps_subtitle")}
              </p>

              <ol className="mt-4 space-y-3">
                <StepCard
                  step="1"
                  icon={Share2}
                  title={t("boost_classic_step1_title")}
                  body={t("boost_classic_step1_body", {
                    reward: referralReward,
                  })}
                />
                <StepCard
                  step="2"
                  icon={Rocket}
                  title={t("boost_classic_step2_title", {
                    minutes: String(BOOST_MINUTES_PER_ACTIVATION),
                  })}
                  body={t("boost_classic_step2_body")}
                />
                <StepCard
                  step="3"
                  icon={Users}
                  title={t("boost_classic_step3_title")}
                  body={t("boost_classic_step3_body")}
                />
              </ol>
            </section>

            <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-300">
                  <GiftIcon />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">
                    {t("boost_classic_invite_title", { reward: referralReward })}
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-7 text-white/60">
                    {t("boost_classic_invite_body", {
                      reward: referralReward,
                    })}
                  </p>
                </div>
              </div>

              {status?.referralLink ? (
                <div className="mt-5 rounded-2xl border border-orange-500/20 bg-black/40 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-orange-200/75">
                    {t("boost_referral_link")}
                  </p>
                  <p className="mt-2 break-all text-sm font-bold leading-6 text-white/85">
                    {status.referralLink}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 py-3 text-sm font-black text-black"
                  >
                    <Copy size={16} />
                    {copied ? t("boost_copied") : t("boost_copy_link")}
                  </button>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatPill
                  label={t("boost_classic_referrals_qualified")}
                  value={String(status?.referralsQualified ?? 0)}
                  tone="green"
                />
                <StatPill
                  label={t("boost_classic_referrals_pending")}
                  value={String(status?.referralsPending ?? 0)}
                  tone="amber"
                />
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-white/40">
                {t("boost_classic_referrals_pending_hint")}
              </p>
            </section>

            <section className="rounded-[1.35rem] border border-white/8 bg-white/[0.02] p-5">
              <p className="flex items-center gap-2 text-base font-black text-orange-200">
                <Sparkles size={18} />
                {t("boost_classic_rules_title")}
              </p>
              <ul className="mt-4 space-y-3">
                <RuleItem text={t("boost_classic_rule1_flexible")} />
                <RuleItem text={t("boost_classic_rule2", { reward: referralReward })} />
                <RuleItem text={t("boost_classic_rule3")} />
                <RuleItem text={t("boost_classic_rule4")} />
              </ul>
            </section>

            {feedback ? (
              <p className="rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-center text-sm font-black text-orange-200">
                {feedback}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {canUseBoost ? (
        <BoostStickyCtaBar active={boostActive}>
          {credits >= BOOST_MIN_MINUTES ? (
            <div className="mb-3 lg:hidden">
              <BoostMinutesPicker
                credits={credits}
                value={selectedMinutes}
                onChange={setSelectedMinutes}
                disabled={isActive || activating}
              />
            </div>
          ) : null}

          {!canActivate && !activating ? (
            <p className="mb-3 text-center text-xs font-semibold leading-5 text-white/45">
              {isActive
                ? t("boost_classic_cta_active", {
                    time: activeUntil ? formatBoostRemaining(activeUntil) : "",
                  })
                : credits < BOOST_MIN_MINUTES
                  ? t("boost_classic_cta_no_minutes")
                  : null}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canActivate}
            onClick={() => void handleActivate()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-4 text-lg font-black text-black shadow-[0_8px_24px_rgba(249,115,22,0.28)] disabled:opacity-45"
          >
            <Rocket size={20} strokeWidth={2.2} />
            {activating
              ? t("common_preparing")
              : t("boost_activate_cta", { minutes: String(selectedMinutes) })}
          </button>
        </BoostStickyCtaBar>
      ) : null}
    </main>
  );
}

function StepCard({
  step,
  icon: Icon,
  title,
  body,
}: {
  step: string;
  icon: typeof Rocket;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-black text-black">
        {step}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon size={16} className="shrink-0 text-orange-300" />
          <p className="font-black text-white">{title}</p>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/55">{body}</p>
      </div>
    </li>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "border-green-500/25 bg-green-500/10 text-green-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-300";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-black uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function RuleItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 text-sm font-semibold leading-6 text-white/55">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-orange-400" />
      {text}
    </li>
  );
}

function GiftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8M4 7h16M12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C10 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 0 0 0-5C14 2 12 7 12 7ZM4 12h16M4 7v5M20 7v5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
