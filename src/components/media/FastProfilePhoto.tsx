"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { profileThumbnailUrl, type ProfileThumbWidth } from "@/lib/media/profileThumbnail";

type Variant = "avatar" | "card" | "profile";
type Props = Omit<ComponentPropsWithoutRef<"img">, "src" | "srcSet"> & {
  src: string;
  variant?: Variant;
};

/** Keep the <img> DOM semantics, layout and loading priorities unchanged.
 * Only public Firebase profile photos use the same-origin thumbnail service.
 * Any server failure returns to the original source without a broken image.
 */
export default function FastProfilePhoto({
  src,
  variant = "avatar",
  onError,
  sizes,
  ...imgProps
}: Props) {
  const [failedOriginal, setFailedOriginal] = useState("");
  const width: ProfileThumbWidth =
    variant === "profile" ? 1280 : variant === "card" ? 960 : 256;
  const optimized = failedOriginal === src ? null : profileThumbnailUrl(src, width);
  // Let Android's high-density display request a sharp card, while smaller
  // avatars and desktop screens use fewer bytes. Every candidate is cacheable.
  const widths: ProfileThumbWidth[] =
    variant === "avatar" ? [96, 256, 384] : [640, 960, 1280];
  const responsiveSources = optimized
    ? widths.map((w) => `${profileThumbnailUrl(src, w)} ${w}w`).join(", ")
    : undefined;
  const responsiveSizes =
    sizes || (variant === "avatar" ? "64px" : "(max-width: 640px) 100vw, 600px");

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imgProps}
      sizes={responsiveSources ? responsiveSizes : undefined}
      srcSet={responsiveSources}
      src={optimized || src}
      data-profile-thumbnail={optimized ? width : undefined}
      onError={(event) => {
        if (optimized) setFailedOriginal(src);
        onError?.(event);
      }}
    />
  );
}
