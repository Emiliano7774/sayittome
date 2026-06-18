"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import UsernameChangedNotice from "@/components/profile/UsernameChangedNotice";
import { resolveProfileChat, isOwnerProfileInboxRedirect } from "@/lib/chat/resolveProfileChat";
import { isProfileUsernameChangedError } from "@/lib/profile/usernameHistory";
import { isVerifiedProfileLink } from "@/lib/profile/verifiedLink";
import { useRouter } from "next/navigation";

export default function UserChatRedirectPage() {
  const params = useParams<{ username: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const username = String(params.username || "usuario");
  const [errorText, setErrorText] = useState("");
  const [usernameChanged, setUsernameChanged] = useState<{
    requestedUsername: string;
    currentUsername: string;
  } | null>(null);
  const verifiedLink = isVerifiedProfileLink(searchParams);

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
        if (cancelled) return;

        if (isOwnerProfileInboxRedirect(e)) {
          router.replace("/chats");
          return;
        }

        if (isProfileUsernameChangedError(e)) {
          setUsernameChanged({
            requestedUsername: e.requestedUsername,
            currentUsername: e.currentUsername,
          });
          return;
        }

        setErrorText("No se pudo abrir el chat.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username, router]);

  if (usernameChanged) {
    return (
      <UsernameChangedNotice
        requestedUsername={usernameChanged.requestedUsername}
        currentUsername={usernameChanged.currentUsername}
        verifiedLink={verifiedLink}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="text-2xl font-black text-white/40">
        {errorText || "Abriendo chat..."}
      </p>
    </main>
  );
}
