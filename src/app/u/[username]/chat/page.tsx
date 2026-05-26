"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { resolveProfileChat } from "@/lib/chat/resolveProfileChat";

export default function UserChatRedirectPage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const username = String(params.username || "usuario");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const resolved = await resolveProfileChat(username);
        if (cancelled) return;

        const query = new URLSearchParams({ u: resolved.username });
        router.replace(
          `/chat/${encodeURIComponent(resolved.chatId)}?${query.toString()}`,
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setErrorText("No se pudo abrir el chat.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="text-2xl font-black text-white/40">
        {errorText || "Abriendo chat..."}
      </p>
    </main>
  );
}
