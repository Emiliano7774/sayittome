"use client";

import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { BadgeCheck, Copy } from "lucide-react";

import { auth, db } from "@/lib/firebase";
import {
  copyVerifiedProfileLink,
  getVerifiedProfileLink,
} from "@/lib/profile/verifiedLink";

type Props = {
  username: string;
  /** Must be true — bubble only renders for profile owner. */
  isOwner: boolean;
};

export default function VerifiedLinkBubble({ username, isOwner }: Props) {
  const [toast, setToast] = useState("");
  const [modalLink, setModalLink] = useState("");

  if (!isOwner) return null;

  async function ensureOwner(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user?.uid) return false;

    try {
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (!snap.exists()) return false;
      const data = snap.data() as { username?: string; usernameLower?: string };
      const mine = String(data.username || data.usernameLower || "")
        .trim()
        .toLowerCase();
      return mine === username.trim().toLowerCase();
    } catch {
      return false;
    }
  }

  async function handleCopy() {
    const allowed = await ensureOwner();
    if (!allowed) {
      alert("Solo el dueño del perfil puede copiar su link verificado.");
      return;
    }

    const result = await copyVerifiedProfileLink(username);

    if (result.ok) {
      setToast("Link verificado copiado");
      window.setTimeout(() => setToast(""), 2200);
      return;
    }

    setModalLink(result.link);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-6 md:right-16 top-[48%] md:top-[47%] z-[28] pointer-events-auto rounded-full border border-violet-300/35 bg-black/70 px-5 py-3 md:px-6 md:py-4 flex items-center gap-3 font-black text-sm md:text-base shadow-[0_0_40px_rgba(139,92,246,.35)] hover:scale-[1.02] active:scale-95 transition"
        aria-label="Copiar link verificado"
      >
        <BadgeCheck size={22} className="text-violet-200" />
        Copiar link verificado
        <Copy size={18} className="text-white/70" />
      </button>

      {toast ? (
        <div className="absolute right-6 md:right-16 top-[56%] z-[40] rounded-full bg-violet-500/90 px-6 py-3 font-black shadow-2xl pointer-events-none">
          {toast}
        </div>
      ) : null}

      {modalLink ? (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-[#111] p-6">
            <p className="text-2xl font-black">Copiá el link verificado</p>
            <input
              readOnly
              value={modalLink || getVerifiedProfileLink(username)}
              className="mt-4 w-full rounded-2xl bg-black border border-white/15 px-4 py-3 font-bold text-white/80"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => setModalLink("")}
              className="mt-5 rounded-full bg-white text-black px-6 py-3 font-black"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
