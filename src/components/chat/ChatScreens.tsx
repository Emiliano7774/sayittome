"use client";

import Link from "next/link";
import { useT } from "@/contexts/LocaleContext";

export function ChatLoadingScreen() {
  const t = useT();

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="text-2xl font-black text-white/40">{t("chat_loading")}</p>
    </main>
  );
}

export function ChatErrorScreen({
  message,
}: {
  message?: string;
}) {
  const t = useT();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
      <p className="text-2xl font-black text-white/40">
        {message || t("chat_unavailable")}
      </p>
      <Link href="/chats" className="text-violet-400 font-bold">
        {t("chat_back_inbox")}
      </Link>
    </main>
  );
}
