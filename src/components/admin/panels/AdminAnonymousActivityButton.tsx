"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { setAnonArrivalPushEnabled } from "@/lib/chat/fcmPush";
import { setAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";

type BroadcastResult = {
  ok?: boolean;
  preview?: boolean;
  reason?: string;
  targetType?: "anonymous" | "profile";
  targetLabel?: string;
  anonymousCount?: number;
  profileCount?: number;
  publishedToFcm?: boolean;
  fcmMessageId?: string;
};

/** Backend verifies owner identity; frontend never authorizes a mass push. */
export default function AdminAnonymousActivityButton() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  function countsText(data: BroadcastResult) {
    return (data.profileCount ?? 0) + " perfiles recientes (15 minutos) y " +
      (data.anonymousCount ?? 0) + " anónimos disponibles.";
  }

  async function enableOnThisDevice() {
    const uid = auth.currentUser?.uid;
    if (busy || !uid || auth.currentUser?.isAnonymous) return;
    setBusy(true);
    setSuccess(false);
    setFeedback("");
    try {
      const ok = await setAnonArrivalPushEnabled(true);
      if (!ok) {
        setFeedback("Este dispositivo todavía no pudo suscribirse. Revisá los permisos de notificaciones y volvé a intentar.");
        return;
      }
      setAnonArrivalPushPreference(uid, true);
      setSuccess(true);
      setFeedback("Dispositivo suscrito a los avisos de conexiones. La visualización final depende de los permisos de Android o del navegador.");
    } catch (error) {
      setFeedback("Error al suscribir este dispositivo: " +
        (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  async function run(preview: boolean) {
    if (busy) return;
    if (!preview && !window.confirm(
      "¿Enviar a las instalaciones suscritas un aviso sobre un perfil o anónimo real, excluyendo la cuenta administradora?"
    )) return;
    setBusy(true);
    setSuccess(false);
    setFeedback("");
    try {
      const fn = httpsCallable<{preview?: boolean; confirm?: boolean}, BroadcastResult>(
        functions, "adminSendAvailableAnonAlert",
      );
      const {data} = await fn(preview ? {preview:true} : {confirm:true});
      if (preview) {
        setSuccess(true);
        setFeedback("Pool sin administradores: " + countsText(data) + " No se envió ninguna notificación.");
        return;
      }
      if (!data.ok) {
        const reasons: Record<string,string> = {
          no_public_online_users: "No hay perfiles ni anónimos elegibles ahora. No se envió nada. ",
          cooldown_15_seconds: "Otro envío ocurrió hace menos de 15 segundos. ",
          broadcast_failed: "Firebase rechazó la publicación. ",
        };
        setFeedback((reasons[String(data.reason)] || "No se pudo enviar. ") + countsText(data));
        return;
      }
      setSuccess(true);
      setFeedback((data.publishedToFcm ? "Firebase aceptó el envío" : "Aviso procesado") +
        " para instalaciones suscritas. Destino: " +
        data.targetLabel + " (" + (data.targetType === "profile" ? "perfil" : "anónimo") + "). " +
        countsText(data) +
        " La publicación no confirma que cada dispositivo haya mostrado la notificación.");
    } catch (error) {
      setFeedback("Error de autorización o conexión: " +
        (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-3xl border border-violet-400/25 bg-violet-500/[0.07] p-6">
      <h2 className="text-xl font-black">Avisos manuales de conexiones</h2>
      <p className="text-sm font-bold text-white/60">
        Solo administración. El pool incluye perfiles recientes (hasta 15 minutos)
        y anónimos disponibles, pero nunca las cuentas administradoras.
        Se alternan ambos tipos cuando hay candidatos.
        Para evitar duplicaciones accidentales, los envíos tienen 15 segundos de separación.
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
        <button type="button" disabled={busy} onClick={() => void enableOnThisDevice()}
          className="rounded-xl border border-emerald-400/30 px-5 py-3 text-sm font-black text-emerald-200 disabled:opacity-50">
          Habilitar recepción en este dispositivo
        </button>
      </div>
      {feedback && (
        <p role="status" className={"text-sm font-semibold " +
          (success ? "text-emerald-300" : "text-amber-300")}>{feedback}</p>
      )}
    </section>
  );
}
