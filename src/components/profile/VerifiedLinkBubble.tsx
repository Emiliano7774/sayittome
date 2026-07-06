"use client";

import { useRef, useState } from "react";
import { BadgeCheck, Copy } from "lucide-react";

import { useProfileOwner } from "@/hooks/useProfileOwner";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import { assertProfileOwner } from "@/lib/profile/owner";
import {
  copyVerifiedProfileLink,
  displayVerifiedProfileLink,
  getVerifiedProfileUrl,
} from "@/lib/profile/verifiedLink";

type Props = {
  username: string;
  profileUid?: string;
  /** inline = header row (classic/APK), modern = compact on card */
  variant?: "inline" | "modern" | "classic";
};

export default function VerifiedLinkBubble({
  username,
  profileUid,
  variant = "inline",
}: Props) {
  const { ready, isOwner } = useProfileOwner(profileUid, username);
  const [toast, setToast] = useState("");
  const [modalLink, setModalLink] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resolvedVariant = variant === "classic" ? "inline" : variant;

  if (!ready || !isOwner) return null;

  async function handleCopy() {
    const allowed = await assertProfileOwner(username);
    if (!allowed) {
      alert("Solo el dueño del perfil puede copiar su link verificado.");
      return;
    }

    const result = await copyVerifiedProfileLink(username);

    if ("denied" in result && result.denied) {
      alert("Solo el dueño del perfil puede copiar su link verificado.");
      return;
    }

    if (result.ok && !isNativeAppShell()) {
      setToast("Link verificado copiado");
      window.setTimeout(() => setToast(""), 2200);
      return;
    }

    setModalLink(result.link || getVerifiedProfileUrl(username));
  }

  async function copyFromModal() {
    const link = modalLink || getVerifiedProfileUrl(username);
    const result = await copyVerifiedProfileLink(username);

    if (result.ok) {
      setToast("Link verificado copiado");
      window.setTimeout(() => setToast(""), 2200);
      setModalLink("");
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }

  const buttonClass =
    resolvedVariant === "modern"
      ? "rounded-full border border-fuchsia-300/35 bg-black/70 px-4 py-2 text-xs font-semibold text-fuchsia-100 shadow-[0_0_30px_rgba(217,70,239,.25)] hover:scale-[1.02] active:scale-95 transition inline-flex items-center gap-2"
      : "rounded-full border border-violet-400/40 bg-black/45 px-7 py-4 flex items-center gap-3 font-black shadow-[0_0_35px_rgba(139,92,246,.25)] hover:bg-black/55 active:scale-95 transition";

  const toastClass =
    resolvedVariant === "modern"
      ? "absolute right-0 top-full mt-2 z-[40] rounded-full bg-fuchsia-500/90 px-4 py-2 text-xs font-semibold shadow-2xl pointer-events-none whitespace-nowrap"
      : "absolute right-0 top-full mt-2 z-[40] rounded-full bg-violet-500/90 px-5 py-2.5 text-sm font-black shadow-2xl pointer-events-none whitespace-nowrap";

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className={buttonClass}
          aria-label="Copiar link verificado"
        >
          <BadgeCheck
            size={resolvedVariant === "modern" ? 16 : 22}
            className="text-violet-200 shrink-0"
          />
          Copiar link verificado
          <Copy
            size={resolvedVariant === "modern" ? 14 : 20}
            className="text-white/70 shrink-0"
          />
        </button>

        {toast ? <div className={toastClass}>{toast}</div> : null}
      </div>

      {modalLink ? (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-[#111] p-6">
            <p className="text-2xl font-black">Copiá el link verificado</p>
            <p className="mt-2 text-sm text-white/55">
              Este link confirma que el perfil es oficial cuando alguien lo abre.
            </p>
            <p className="mt-3 text-sm font-bold text-violet-200">
              {displayVerifiedProfileLink(username)}
            </p>
            <input
              ref={inputRef}
              readOnly
              value={modalLink}
              className="mt-4 w-full rounded-2xl bg-black border border-white/15 px-4 py-3 font-bold text-white/80"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyFromModal}
                className="rounded-full bg-violet-500 text-white px-6 py-3 font-black inline-flex items-center gap-2"
              >
                <Copy size={18} />
                Copiar
              </button>
              <button
                type="button"
                onClick={() => setModalLink("")}
                className="rounded-full bg-white text-black px-6 py-3 font-black"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
