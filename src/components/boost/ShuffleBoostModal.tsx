"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Rocket, Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useBoostModal } from "@/contexts/BoostModalContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useBoostStatus } from "@/hooks/useBoostStatus";
import { BOOST_MINUTES_PER_ACTIVATION, BOOST_MINUTES_PER_REFERRAL } from "@/lib/boost/constants";

function formatRemaining(untilMs: number) {
  const diff = Math.max(0, untilMs - Date.now());
  const mins = Math.ceil(diff / 60_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

export default function ShuffleBoostModal() {
  const { open, closeBoostModal } = useBoostModal();
  const { firebaseUser } = useAuth();
  const { t } = useLocale();
  const { status, loading, activate } = useBoostStatus(open);
  const [activating, setActivating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setFeedback("");
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleActivate() {
    setActivating(true);
    setFeedback("");
    const result = await activate();
    setActivating(false);

    if (result.ok) {
      setFeedback(t("boost_activate_success"));
      return;
    }

    const reason = String(result.reason || result.error || "");
    if (
      reason === "insufficient_credits" ||
      reason === "already_active" ||
      reason === "not_authenticated" ||
      reason === "no_profile"
    ) {
      setFeedback(t(`boost_error_${reason}` as "boost_error_insufficient_credits"));
    } else {
      setFeedback(t("boost_error_unknown"));
    }
  }

  async function handleCopy() {
    const link = status?.referralLink;
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback(t("boost_copy_fail"));
    }
  }

  const credits = status?.boostCreditsMinutes ?? 0;
  const activeUntil = status?.activeBoostUntil ?? null;
  const isActive = activeUntil != null && activeUntil > Date.now();

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/85 px-4 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boost-modal-title"
      onClick={closeBoostModal}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-orange-400/30 bg-[#07070B] p-6 shadow-[0_16px_34px_rgba(249,115,22,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400">
            <Rocket size={21} className="text-white" />
          </div>
          <div>
            <h2 id="boost-modal-title" className="text-[22px] font-black text-white">
              {t("boost_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">{t("boost_subtitle")}</p>
          </div>
        </div>

        {!firebaseUser ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm leading-6 text-white/65">{t("boost_login_required")}</p>
            <Link
              href="/register"
              onClick={closeBoostModal}
              className="block w-full rounded-[18px] bg-[#6C63FF] py-3.5 text-center text-sm font-black text-white"
            >
              {t("home_create_profile")}
            </Link>
            <button
              type="button"
              onClick={closeBoostModal}
              className="w-full rounded-[18px] border border-white/10 bg-white/[0.055] py-3.5 text-sm font-extrabold text-white/80"
            >
              {t("common_cancel")}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">
                  {t("boost_credits_label")}
                </p>
                <p className="mt-1 text-2xl font-black text-orange-300">
                  {loading && !status ? "…" : `${credits} min`}
                </p>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">
                  {t("boost_active_label")}
                </p>
                <p className="mt-1 text-lg font-black text-white">
                  {isActive ? formatRemaining(activeUntil!) : t("boost_inactive")}
                </p>
              </div>
            </div>

            <div className="rounded-[16px] border border-violet-500/20 bg-violet-500/10 p-4 text-sm leading-6 text-white/75">
              <p className="font-bold text-violet-200">{t("boost_how_title")}</p>
              <p className="mt-2">{t("boost_how_body", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}</p>
              <p className="mt-2">{t("boost_referral_body", { minutes: String(BOOST_MINUTES_PER_REFERRAL) })}</p>
              <p className="mt-2 text-white/55">{t("boost_security_note")}</p>
            </div>

            {status?.referralLink ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">
                  {t("boost_referral_link")}
                </p>
                <div className="flex items-center gap-2 rounded-[14px] border border-white/10 bg-black/40 px-3 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">
                    {status.referralLink}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white"
                  >
                    <Copy size={14} />
                    {copied ? t("boost_copied") : t("boost_copy")}
                  </button>
                </div>
                <p className="text-xs text-white/45">
                  {t("boost_referrals_stats", {
                    qualified: String(status.referralsQualified),
                    pending: String(status.referralsPending),
                  })}
                </p>
              </div>
            ) : null}

            {feedback ? (
              <p className="text-sm font-bold text-orange-200">{feedback}</p>
            ) : null}

            <button
              type="button"
              disabled={activating || isActive || credits < BOOST_MINUTES_PER_ACTIVATION}
              onClick={() => void handleActivate()}
              className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-orange-500 to-amber-400 py-3.5 text-sm font-black text-black disabled:opacity-45"
            >
              <Sparkles size={16} />
              {activating
                ? t("common_preparing")
                : t("boost_activate_cta", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}
            </button>

            <button
              type="button"
              onClick={closeBoostModal}
              className="w-full rounded-[18px] border border-white/10 bg-white/[0.055] py-3.5 text-sm font-extrabold text-white/80"
            >
              {t("common_cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
