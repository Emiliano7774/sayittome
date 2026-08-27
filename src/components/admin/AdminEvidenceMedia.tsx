"use client";

import { isVideoMediaUrl } from "@/lib/media/mediaUrl";
import { useT } from "@/contexts/LocaleContext";

export type AdminEvidenceMediaType = "image" | "photo" | "video";

type Props = {
  url: string;
  /** Explicit message type — URL extension must not override this. */
  mediaType?: AdminEvidenceMediaType | string;
  className?: string;
  maxHeightClass?: string;
};

function resolveRenderKind(url: string, mediaType?: string): "video" | "image" {
  const explicit = String(mediaType || "").trim().toLowerCase();
  if (explicit === "video") return "video";
  if (explicit === "image" || explicit === "photo") return "image";
  return isVideoMediaUrl(url) ? "video" : "image";
}

export default function AdminEvidenceMedia({
  url,
  mediaType,
  className = "mt-3 block max-w-md overflow-hidden rounded-xl border border-white/10",
  maxHeightClass = "max-h-80",
}: Props) {
  const t = useT();

  if (!url) return null;

  const kind = resolveRenderKind(url, mediaType);

  if (kind === "video") {
    return (
      <div className={className}>
        <video
          key={url}
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
        key={url}
        src={url}
        alt={t("admin_appeal_photo")}
        className={`w-full object-cover ${maxHeightClass}`}
      />
    </a>
  );
}
