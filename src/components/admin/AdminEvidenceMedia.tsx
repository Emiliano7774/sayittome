"use client";

import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  url: string;
  className?: string;
  maxHeightClass?: string;
};

export default function AdminEvidenceMedia({
  url,
  className = "mt-3 block max-w-md overflow-hidden rounded-xl border border-white/10",
  maxHeightClass = "max-h-80",
}: Props) {
  const t = useT();

  if (!url) return null;

  if (isVideoMediaUrl(url)) {
    return (
      <div className={className}>
        <video
          src={url}
          controls
          playsInline
          className={`w-full ${maxHeightClass} bg-black object-contain`}
        />
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      <img
        src={url}
        alt={t("admin_appeal_photo")}
        className={`w-full object-cover ${maxHeightClass}`}
      />
    </a>
  );
}
