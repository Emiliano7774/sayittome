"use client";

import { useState } from "react";

type Props = {
  onReveal?: () => void;
  label?: string;
};

export default function SensitiveBlurOverlay({
  onReveal,
  label = "Contenido sensible",
}: Props) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-md">
      <div
        className="pointer-events-none absolute inset-0 bg-black/45"
        aria-hidden
      />
      <p className="relative z-10 text-xl font-black text-white/90">{label}</p>
      <button
        type="button"
        onClick={() => {
          setRevealed(true);
          onReveal?.();
        }}
        className="relative z-10 mt-5 rounded-full border border-white/25 bg-white/10 px-8 py-3 text-sm font-black text-white active:scale-95"
      >
        Ver igual
      </button>
    </div>
  );
}
