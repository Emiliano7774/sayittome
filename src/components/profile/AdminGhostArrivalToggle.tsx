"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { EyeOff, Eye } from "lucide-react";

import { auth, functions } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";

type GhostResponse = {enabled: boolean};
const ghostControl = httpsCallable<{action: "get" | "set"; enabled?: boolean}, GhostResponse>(
  functions, "adminArrivalGhostControl",
);

/** Administrator-only UI, with a server-only preference inaccessible to other profiles. */
export default function AdminGhostArrivalToggle({ ownerUid }: {ownerUid: string}) {
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const admin = auth.currentUser;
  const authorized = Boolean(
    admin && admin.uid === ownerUid && isAdminEmail(admin.email) && admin.emailVerified
  );

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    setLoaded(false);
    setError("");
    void ghostControl({action:"get"}).then(({data}) => {
      if (cancelled) return;
      setActive(data.enabled === true);
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setError("No se pudo leer el modo fantasma.");
    });
    return () => {cancelled = true;};
  }, [authorized, ownerUid]);

  if (!authorized) return null;

  async function toggle() {
    const user = auth.currentUser;
    if (!user || !isAdminEmail(user.email) || user.uid !== ownerUid ||
        !user.emailVerified || !loaded || busy) return;
    const next = !active;
    setBusy(true);
    setError("");
    try {
      const {data} = await ghostControl({action:"set",enabled:next});
      setActive(data.enabled === true);
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
              {!loaded ? "Consultando configuración privada..." : active
                ? "Activado: no se anuncia tu entrada después de 15 minutos."
                : "Desactivado: tu reconexión se anuncia normalmente."}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={active ? "Desactivar modo fantasma" : "Activar modo fantasma"}
          aria-pressed={active}
          disabled={busy || !loaded}
          onClick={() => void toggle()}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${active ? "bg-violet-600 text-white" : "bg-white/15 text-white"}`}
        >
          {busy ? "Guardando..." : !loaded ? "..." : active ? "ON" : "OFF"}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
