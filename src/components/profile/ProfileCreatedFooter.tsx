"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type Props = {
  label: string;
};

/** Viewport-fixed footer; rendered on document.body to avoid scroll/transform containing blocks. */
export default function ProfileCreatedFooter({ label }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !label) {
    return null;
  }

  return createPortal(
    <p
      className="pointer-events-none fixed inset-x-0 z-[25] px-6 text-center text-sm italic text-white/35 md:text-base"
      style={{ bottom: "calc(var(--sayittome-bottom-ui, 0px) + 0.75rem)" }}
    >
      {label}
    </p>,
    document.body,
  );
}
