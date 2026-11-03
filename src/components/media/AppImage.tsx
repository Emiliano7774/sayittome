"use client";

import FastProfilePhoto from "@/components/media/FastProfilePhoto";

type Props = {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
};

export default function AppImage({
  src,
  alt,
  className,
  fill,
  width,
  height,
  priority,
}: Props) {
  if (!src) return null;

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <FastProfilePhoto
        src={src}
        variant="card"
        alt={alt}
        className={["absolute inset-0 h-full w-full", className || ""].join(" ")}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <FastProfilePhoto
      src={src}
      variant="avatar"
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
