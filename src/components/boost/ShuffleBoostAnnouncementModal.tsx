"use client";

import { useRouter } from "next/navigation";
import { Rocket, Sparkles } from "lucide-react";

import { useLocale } from "@/contexts/LocaleContext";
import { useUxMode } from "@/contexts/UxModeContext";
import { BOOST_MINUTES_PER_ACTIVATION, BOOST_MINUTES_PER_REFERRAL } from "@/lib/boost/constants";

type Props = {
  onDismiss: () => void;
};

export default function ShuffleBoostAnnouncementModal({ onDismiss }: Props) {
  const { t } = useLocale();
  const { uxMode } = useUxMode();
  const router = useRouter();

  function handleOpenBoost() {
    onDismiss();
    router.push("/boost");
  }

  return (
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boost-announce-title"
    >
      <div
        className={[
          "w-full max-w-md overflow-hidden rounded-[1.75rem] border border-orange-400/35 bg-[#07070B] p-6 shadow-[0_16px_34px_rgba(249,115,22,0.25)]",
          uxMode === "classic" ? "max-h-[90vh] overflow-y-auto" : "",
        ].join(" ")}
      >
        <div className="relative overflow-hidden rounded-[1.25rem] border border-orange-400/20 bg-gradient-to-br from-orange-500/20 via-[#120810] to-black p-5">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-300">
              <Rocket size={24} className="text-black" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                {t("boost_announce_badge")}
              </p>
              <h2 id="boost-announce-title" className="text-2xl font-black text-white">
                {t("boost_announce_title")}
              </h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/75">{t("boost_announce_body")}</p>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-orange-300" />
              {t("boost_announce_point_top", { minutes: String(BOOST_MINUTES_PER_ACTIVATION) })}
            </li>
            <li className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-orange-300" />
              {t("boost_announce_point_referral", { minutes: String(BOOST_MINUTES_PER_REFERRAL) })}
            </li>
            <li className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-orange-300" />
              {t("boost_announce_point_security")}
            </li>
          </ul>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleOpenBoost}
            className="w-full rounded-[18px] bg-gradient-to-r from-orange-500 to-amber-400 py-3.5 text-sm font-black text-black"
          >
            {t("boost_announce_cta")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-[18px] border border-white/10 bg-white/[0.055] py-3.5 text-sm font-extrabold text-white/80"
          >
            {t("boost_announce_later")}
          </button>
        </div>
      </div>
    </div>
  );
}
