"use client";

import { useState } from "react";

type Props = {
  username: string;
};

export default function CopyProfileLinkButton({ username }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const base = window.location.origin;
    const url = base + "/u/" + username;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1800);
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
      {copied ? "Link copiado" : "Copiar link verificado"}
    </button>
  );
}