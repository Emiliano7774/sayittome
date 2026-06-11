"use client";

import type { ReactNode } from "react";

import ProfilePreviewVideo from "@/components/profile/ProfilePreviewVideo";
import { isVideoMediaUrl } from "@/lib/media/mediaUrl";

type Props = {
  url: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  videoClassName?: string;
  children?: ReactNode;
};

export default function ProfileMediaSurface({
  url,
  alt = "",
  className = "",
  imageClassName = "h-full w-full object-cover",
  videoClassName = "h-full w-full object-cover",
}: Props) {
  if (!url) return null;

  if (isVideoMediaUrl(url)) {
    return (
      <ProfilePreviewVideo
        src={url}
        className={className}
        videoClassName={videoClassName}
      />
    );
  }

  return (
    <img src={url} alt={alt} className={imageClassName} draggable={false} />
  );
}
