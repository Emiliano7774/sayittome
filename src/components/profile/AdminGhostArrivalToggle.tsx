"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { EyeOff, Eye } from "lucide-react";

import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";

/** Only appears on the signed-in administrator's own profile. */
export default function AdminGhostArrivalToggle({
  ownerUid,
  enabled,
  onChange,
}: {
  ownerUid: string;
  enabled: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  const [active, setActive] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setActive(enabled); }, [enabled]);

  const admin = auth.currentUser;
  if (!admin || admin.uid !== ownerUid || !isAdminEmail(admin.email) || !admin.emailVerified) {
    return null;
  }

  async function toggle() {
    const user = auth.currentUser;
    if (!user || user.uid !== ownerUid || !isAdminEmail(user.email) || !user.emailVerified || busy) return;
    const next = !active;
    setBusy(true);
    setError("");
    try {
      // Server-side notification suppression is enforced independently by the
      // signed Firebase callable's verified admin email claim.
      await updateDoc(doc(db, "usuarios", user.uid), {
        adminGhostArrivalEnabled: next,
      });
      setActive(next);
      onChange?.(next);
    } catch {
      setError("No se pudo guardar. Volvé a intentar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-admin-arrival-ghost className="rounded-2xl border border-violet-500/35 bg-zinc-950/95 px-4 py-3 text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {active ? <EyeOff size={18} className="shrink-0 text-violet-300" /> : <Eye size={18} className="shrink-0 text-white/65" />}
          <div className="min-w-0">
            <p className="text-sm font-bold">Modo fantasma · Administrador</p>
            <p className="text-xs leading-snug text-white/60">
              {active
                ? "Activado: no se anuncia tu entrada después de 15 minutos."
                : "Desactivado: tu reconexión se anuncia normalmente."}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={active ? "Desactivar modo fantasma" : "Activar modo fantasma"}
          aria-pressed={active}
          disabled={busy}
          onClick={() => void toggle()}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${active ? "bg-violet-600 text-white" : "bg-white/15 text-white"}`}
        >
          {busy ? "Guardando..." : active ? "ON" : "OFF"}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
