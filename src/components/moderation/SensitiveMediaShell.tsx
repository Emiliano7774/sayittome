"use client";

import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";

import SensitiveConsentModal from "@/components/moderation/SensitiveConsentModal";
import { useSensitiveMedia } from "@/hooks/useSensitiveMedia";
import { useT } from "@/contexts/LocaleContext";
import type { MessageBlurSource, ModerationBlurSource } from "@/lib/moderation/blur";

type Props = {
  url?: string;
  mediaType?: "image" | "video";
  staticRequiresBlur?: boolean;
  profile?: ModerationBlurSource;
  story?: ModerationBlurSource;
  message?: MessageBlurSource;
  galleryContext?: boolean;
  ownerProfile?: ModerationBlurSource;
  enableRuntimeScan?: boolean;
  className?: string;
  blurClassName?: string;
  overlayLabel?: string;
  blockVideoAutoplay?: boolean;
  children: ReactNode;
};

export default function SensitiveMediaShell({
  url,
  mediaType = "image",
  staticRequiresBlur = false,
  profile,
  story,
  message,
  galleryContext,
  ownerProfile,
  enableRuntimeScan = true,
  className = "relative overflow-hidden",
  blurClassName = "blur-2xl scale-110",
  overlayLabel,
  blockVideoAutoplay = true,
  children,
}: Props) {
  const t = useT();
  const { showBlur, grantReveal } = useSensitiveMedia({
    url,
    mediaType,
    staticRequiresBlur,
    profile,
    story,
    message,
    galleryContext,
    ownerProfile,
    enableRuntimeScan,
  });

  const [modalOpen, setModalOpen] = useState(false);

  const renderedChildren =
    blockVideoAutoplay && showBlur && mediaType === "video"
      ? disableVideoAutoplay(children)
      : children;

  return (
    <>
      <div className={className}>
        <div
          className={[
            "h-full w-full transition duration-300",
            showBlur ? blurClassName : "",
          ].join(" ")}
        >
          {renderedChildren}
        </div>

        {showBlur ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-md"
            aria-label={overlayLabel || "Contenido sensible"}
          >
            <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden />
            <p className="relative z-10 text-base font-black text-white/90 md:text-lg">
              {overlayLabel || "Contenido sensible"}
            </p>
            <span className="relative z-10 mt-4 rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-xs font-black text-white/85">
              {t("sensitive_overlay_cta")}
            </span>
          </button>
        ) : null}
      </div>

      <SensitiveConsentModal
        open={modalOpen}
        onConfirm={() => {
          grantReveal();
          setModalOpen(false);
        }}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
}

function disableVideoAutoplay(children: ReactNode): ReactNode {
  if (Array.isArray(children)) {
    return children.map((child) => disableVideoAutoplay(child));
  }

  if (!isValidElement(children) || children.type !== "video") {
    return children;
  }

  const video = children as ReactElement<{
    autoPlay?: boolean;
    controls?: boolean;
    preload?: string;
  }>;

  return cloneElement(video, {
    autoPlay: false,
    controls: false,
    preload: "metadata",
  });
}
