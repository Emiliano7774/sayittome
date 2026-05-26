"use client";

import { useState } from "react";

import { useProfileOwner } from "@/hooks/useProfileOwner";

type Props = {
  username: string;
  profileUid?: string;
};

/** Plain public profile link — not the verified link. Owner only. */
export default function CopyProfileLinkButton({ username, profileUid }: Props) {
  const { ready, isOwner } = useProfileOwner(profileUid, username);
  const [copied, setCopied] = useState(false);

  if (!ready || !isOwner) return null;

  const copyLink = async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error(e);
      alert("No se pudo copiar el link.");
    }
  };

  return (
    <button
      type="button"
      onClick={copyLink}
      className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/20 px-6 py-4 text-sm font-black text-white shadow-[0_0_30px_rgba(217,70,239,0.15)] transition hover:bg-fuchsia-500/30"
    >
      {copied ? "Link copiado" : "Copiar link del perfil"}
    </button>
  );
}
