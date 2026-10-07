"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = {
  url: string;
  alt: string;
  className: string;
  maxHeightClass: string;
};

export default function AdminEvidenceImage({ url, alt, className, maxHeightClass }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <img src={url} alt={alt} className={`w-full object-cover ${maxHeightClass}`} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              className="fixed inset-0 z-[1000] flex items-center justify-center overflow-auto bg-black/95 p-4 sm:p-8"
              onClick={() => setOpen(false)}
            >
              <button
                type="button"
                aria-label="Cerrar imagen"
                onClick={() => setOpen(false)}
                className="fixed right-4 top-4 z-[1001] flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white"
              >
                <X size={26} />
              </button>
              <img
                src={url}
                alt={alt}
                onClick={(event) => event.stopPropagation()}
                className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] object-contain sm:max-h-[calc(100dvh-4rem)] sm:max-w-[calc(100vw-4rem)]"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
