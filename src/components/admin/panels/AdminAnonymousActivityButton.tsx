"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

type BroadcastResult = {
  ok?: boolean;
  preview?: boolean;
  reason?: string;
  targetType?: "anonymous" | "profile";
  targetLabel?: string;
  anonymousCount?: number;
  profileCount?: number;
};

/** Cloud Function independently enforces verified-owner authorization. */
export default function AdminAnonymousActivityButton() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  function countsText(data: BroadcastResult) {
    return (data.profileCount ?? 0) + " perfiles y " +
      (data.anonymousCount ?? 0) + " anónimos públicos conectados.";
  }

  async function run(preview: boolean) {
    if (busy) return;
    if (!preview && !window.confirm(
      "¿Enviar una notificación a todas las instalaciones suscritas sobre un perfil o anónimo realmente conectado?"
    )) return;
    setBusy(true);
    setSuccess(false);
    setFeedback("");
    try {
      const fn = httpsCallable<{preview?: boolean; confirm?: boolean}, BroadcastResult>(
        functions, "adminSendAvailableAnonAlert"
      );
      const { data } = await fn(preview ? {preview:true} : {confirm:true});
      if (preview) {
        setSuccess(true);
        setFeedback("Pool actual: " + countsText(data) + " No se envió ninguna notificación.");
        return;
      }
      if (!data.ok) {
        const reasons: Record<string,string> = {
          no_public_online_users: "No hay perfiles ni anónimos públicos conectados ahora. " +
            "La notificación no se envió. ",
          cooldown_60_minutes: "Solo se permite un aviso manual por hora. ",
          broadcast_failed: "Firebase no pudo enviar la notificación. ",
        };
        setFeedback((reasons[String(data.reason)] || "No se pudo enviar. ") + countsText(data));
        return;
      }
      setSuccess(true);
      setFeedback("Aviso publicado en Firebase para instalaciones suscritas: " +
        data.targetLabel + " (" + (data.targetType === "profile" ? "perfil" : "anónimo") + "). " +
        countsText(data) + " La recepción depende de FCM y de los permisos del dispositivo.");
    } catch (error) {
      setFeedback("No se pudo consultar Firebase: " +
        (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-3xl border border-violet-400/25 bg-violet-500/[0.07] p-6">
      <h2 className="text-xl font-black">Avisos manuales de conexiones</h2>
      <p className="text-sm font-bold text-white/60">
        Solo administración. El pool incluye perfiles registrados y anónimos
        actualmente conectados, públicos y accesibles. Se selecciona un destino
        real y al tocar el aviso se abre su perfil o chat. Se alternan los dos
        tipos cuando ambos están disponibles. Máximo un envío por hora.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void run(true)}
          className="rounded-xl border border-violet-400/40 px-5 py-3 text-sm font-black text-violet-100 disabled:opacity-50">
          {busy ? "Consultando..." : "Ver pool conectado"}
        </button>
        <button type="button" disabled={busy} onClick={() => void run(false)}
          className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
          {busy ? "Procesando..." : "Enviar aviso de conexión"}
        </button>
      </div>
      {feedback && (
        <p role="status" className={"text-sm font-semibold " +
          (success ? "text-emerald-300" : "text-amber-300")}>{feedback}</p>
      )}
    </section>
  );
}
