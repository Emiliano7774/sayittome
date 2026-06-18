"use client";

import { useT } from "@/contexts/LocaleContext";
import { openPlayStore, PLAY_STORE_URL } from "@/lib/app/playStore";

type Props = {
  label?: string;
  className?: string;
  showBadgeLines?: boolean;
};

function PlayMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M4.5 3.2v17.6c0 .7.8 1.1 1.4.7l11.8-6.8c.6-.4.6-1 0-1.4L5.9 2.5c-.6-.4-1.4 0-1.4.7Z" />
    </svg>
  );
}

export default function PlayStoreButton({
  label,
  className = "",
  showBadgeLines = false,
}: Props) {
  const t = useT();

  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.preventDefault();
        openPlayStore();
      }}
      className={className}
    >
      {showBadgeLines ? (
        <span className="flex items-center gap-3">
          <PlayMark className="h-7 w-7 shrink-0" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
              {t("play_store_badge_line1")}
            </span>
            <span className="block text-base font-semibold">{t("play_store_badge_line2")}</span>
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          <PlayMark className="h-4 w-4 shrink-0" />
          <span>{label ?? t("apk_download")}</span>
        </span>
      )}
    </a>
  );
}
