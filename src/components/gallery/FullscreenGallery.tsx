"use client";

import { useState } from "react";

type Props = {
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
};

export default function FullscreenGallery({
  photos,
  initialIndex = 0,
  onClose,
}: Props) {
  const [index, setIndex] = useState(initialIndex);

  const current = photos[index];

  return (
    <div
      className="
        fixed
        inset-0
        bg-black
        z-[999999]
        flex
        items-center
        justify-center
      "
    >
      <button
        onClick={onClose}
        className="
          absolute
          top-6
          right-6
          text-white
          text-4xl
        "
      >
        ×
      </button>

      <img
        src={current}
        className="
          max-w-full
          max-h-full
          object-contain
        "
      />

      <button
        onClick={() =>
          setIndex((prev) =>
            prev <= 0 ? photos.length - 1 : prev - 1
          )
        }
        className="
          absolute
          left-5
          text-white
          text-5xl
        "
      >
        ‹
      </button>

      <button
        onClick={() =>
          setIndex((prev) =>
            prev >= photos.length - 1 ? 0 : prev + 1
          )
        }
        className="
          absolute
          right-5
          text-white
          text-5xl
        "
      >
        ›
      </button>
    </div>
  );
}
