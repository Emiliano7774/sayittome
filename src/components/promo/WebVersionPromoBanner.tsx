"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Globe, X } from "lucide-react";

import { isNativeAppShell } from "@/lib/app/nativeShell";
import { HOSTED_WEB_URL, openHostedWeb } from "@/lib/app/hostedWeb";
import {
  dismissWebHomeBanner,
  isWebHomeBannerDismissed,
} from "@/lib/promo/webHomeBannerDismiss";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  variant?: "classic" | "modern";
  className?: string;
};

export default function WebVersionPromoBanner({
  variant = "classic",
  className = "",
}: Props) {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isNativeAppShell()) {
      setVisible(false);
      return;
    }

    setVisible(!isWebHomeBannerDismissed());
  }, []);

  function dismiss() {
    dismissWebHomeBanner();
    setVisible(false);
  }

  function handleOpenWeb(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    openHostedWeb();
  }

  if (!visible) return null;

  const isModern = variant === "modern";

  return (
    <div
      role="region"
      aria-label={t("web_promo_region_label")}
      className={[
        isModern
          ? "relative mt-8 rounded-2xl border border-white/10 bg-zinc-950/60 p-4"
          : "relative mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4",
        className,
      ].join(" ")}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("web_promo_dismiss")}
        className="absolute right-3 top-3 z-10 min-h-11 min-w-11 rounded-full p-2 text-white/35 transition hover:bg-white/10 hover:text-white/70"
      >
        <X size={16} />
      </button>

      <div className="flex min-w-0 items-start gap-3 pr-10">
        <div
          className={[
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            isModern ? "bg-white/5 text-zinc-400" : "bg-white/5 text-zinc-400",
          ].join(" ")}
        >
          <Globe size={16} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-[-0.02em] text-zinc-200">
            {t("web_promo_title")}
          </p>
          <p className="mt-1 text-sm font-normal leading-6 tracking-[-0.025em] text-zinc-400">
            {t("web_promo_body")}
          </p>
          <a
            href={HOSTED_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleOpenWeb}
            className={
              isModern
                ? "mt-3 inline-flex min-h-11 items-center text-sm font-normal text-fuchsia-300/90 underline-offset-4 hover:underline"
                : "mt-3 inline-flex min-h-11 items-center text-sm font-medium tracking-[-0.02em] text-violet-300/90 underline-offset-4 hover:underline"
            }
          >
            {t("web_promo_cta")}
          </a>
        </div>
      </div>
    </div>
  );
}
