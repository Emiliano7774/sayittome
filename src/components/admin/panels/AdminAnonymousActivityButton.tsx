"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

type BroadcastResult = {ok?: boolean; reason?: string; anonLabel?: string};

/** Control visible only inside /admin/system; Cloud Function also enforces verified owner auth. */
export default function AdminAnonymousActivityButton() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  async function send() {
    if (busy || !window.confirm("Enviar un aviso de un anónimo realmente disponible a las instalaciones suscritas?")) return;
    setBusy(true);
    setFeedback("");
    setSuccess(false);
    try {
      const fn = httpsCallable< {confirm: boolean}, BroadcastResult >(functions, "adminSendAvailableAnonAlert");
      const response = await fn({confirm:true});
      if (!response.data?.ok) {
        const messages:Record<string,string> = {
          no_available_anonymous: "No hay anónimos públicos disponibles ahora. No se envió nada.",
          cooldown_60_minutes: "Se permite un aviso manual por hora para evitar saturar a los usuarios.",
          broadcast_failed: "Firebase rechazó el envío. Revisá las funciones.",
        };
        setFeedback(messages[String(response.data?.reason)] || "No se pudo enviar el aviso.");
        return;
      }
      setSuccess(true);
      setFeedback("Aviso enviado al tema de dispositivos suscritos. Destino: Anónimo-" + response.data.anonLabel + ". La entrega individual depende de FCM y los permisos.");
    } catch (err) {
      setFeedback("Error de autorización o conexión: " + (err instanceof Error ? err.message : "desconocido"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-3xl border border-violet-400/25 bg-violet-500/[0.07] p-6">
      <h2 className="text-xl font-black">Aviso manual de actividad anónima</h2>
      <p className="text-sm font-bold text-white/60">
        Exclusivo del administrador. Notifica sobre un anónimo real, público y disponible;
        abre su chat al tocar el aviso. Solo llega a instalaciones que habilitaron
        las notificaciones de conexiones. Máximo un envío cada 60 minutos.
      </p>
      <button type="button" disabled={busy} onClick={() => void send()}
        className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
        {busy ? "Enviando..." : "Enviar aviso de anónimo disponible"}
      </button>
      {feedback && <p role="status" className={"text-sm font-semibold " + (success ? "text-emerald-300" : "text-amber-300")}>{feedback}</p>}
    </section>
  );
}
