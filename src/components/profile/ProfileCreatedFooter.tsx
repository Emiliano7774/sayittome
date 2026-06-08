"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type Props = {
  label: string;
};

/** Always pinned above the app bottom nav, independent of page scroll. */
export default function ProfileCreatedFooter({ label }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !label) {
    return null;
  }

  return createPortal(
    <div
      className="sayittome-profile-created-footer pointer-events-none fixed inset-x-0 z-[9990] px-6 text-center text-sm italic text-white/35 md:text-base"
      style={{
        bottom: "calc(var(--sayittome-bottom-ui, 74px) + 0.5rem)",
        transform: "translateZ(0)",
      }}
    >
      {label}
    </div>,
    document.body,
  );
}
