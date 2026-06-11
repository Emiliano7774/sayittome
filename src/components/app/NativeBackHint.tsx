"use client";

import { useEffect, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import type { MessageKey } from "@/lib/i18n/getMessage";

export default function NativeBackHint() {
  const t = useT();
  const [messageKey, setMessageKey] = useState<MessageKey | null>(null);

  useEffect(() => {
    const onHint = (event: Event) => {
      const key = (event as CustomEvent<{ key?: MessageKey }>).detail?.key;
      if (!key) return;
      setMessageKey(key);
      window.setTimeout(() => setMessageKey(null), 1800);
    };

    window.addEventListener("sayittome:native-back-hint", onHint);
    return () => window.removeEventListener("sayittome:native-back-hint", onHint);
  }, []);

  if (!messageKey) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--sayittome-bottom-ui,0px)+18px)] z-[12000] flex justify-center px-6">
      <div className="rounded-full border border-white/10 bg-[#141414]/95 px-5 py-3 text-sm font-black text-white/85 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
        {t(messageKey)}
      </div>
    </div>
  );
}
