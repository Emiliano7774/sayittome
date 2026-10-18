"use client";

import { BellRing, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { isCapacitorNative } from "@/lib/app/nativeShell";
import { useLocale } from "@/contexts/LocaleContext";
import { requestChatNotificationPermission } from "@/lib/chat/chatNotifications";
import { setAnonArrivalPushEnabled } from "@/lib/chat/fcmPush";
import { getAnonArrivalPushPreference, setAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";

type Props = { compact?: boolean };
type BrowserPermission = "granted" | "denied" | "default" | "unsupported" | "native";

function getBrowserPermission(): BrowserPermission {
  if (typeof window === "undefined") return "unsupported";
  if (isCapacitorNative()) return "native";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export default function AnonArrivalPushSettings({ compact = false }: Props) {
  const { locale } = useLocale();
  const es = locale === "es";
  const [enabled, setEnabled] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [permission, setPermission] = useState<BrowserPermission>("unsupported");
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = () => {
      const user = auth.currentUser;
      const isRegistered = Boolean(user && !user.isAnonymous);
      setRegistered(isRegistered);
      setEnabled(isRegistered ? getAnonArrivalPushPreference(user?.uid || "") : false);
      setPermission(getBrowserPermission());
    };
    sync();
    const unsubscribe = auth.onAuthStateChanged(sync);
    window.addEventListener("sayittome:anon-arrival-prefs", sync);
    window.addEventListener("sayittome:chat-notification-prefs", sync);
    window.addEventListener("focus", sync);
    const visibility = () => { if (!document.hidden) sync(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe();
      window.removeEventListener("sayittome:anon-arrival-prefs", sync);
      window.removeEventListener("sayittome:chat-notification-prefs", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function enableBrowserDelivery() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous || busy || !getAnonArrivalPushPreference(user.uid)) return;
    setBusy(true);
    setMessage("");
    try {
      // The permission call starts directly from this click; no async work
      // before it, otherwise Chrome/Brave Android may lose user activation.
      const granted = await requestChatNotificationPermission({ force: true, forArrival: true });
      setPermission(getBrowserPermission());
      if (!granted) {
        setMessage(es
          ? "Los avisos de conexiones siguen activados dentro de SayItToMe. Para verlos con la web cerrada, permití Notificaciones para este sitio en Chrome o Brave."
          : "Connection alerts remain enabled inside SayItToMe. To get background alerts, allow site notifications in Chrome or Brave.");
        return;
      }
      const ok = await setAnonArrivalPushEnabled(true);
      setMessage(ok
        ? (es ? "Este navegador ya está suscrito a los avisos de conexiones." : "This browser is subscribed to connection alerts.")
        : (es ? "El navegador dio permiso, pero no se pudo registrar Web Push. Usá «Activar/reparar avisos del navegador» en Notificaciones." : "Permission was granted but Web Push could not be registered. Use the browser notification repair option."));
    } catch {
      setMessage(es ? "No se pudo completar la suscripción del navegador. Los avisos internos permanecen activados." : "Browser subscription failed. In-app alerts remain enabled.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    const uid = auth.currentUser?.uid || "";
    if (!uid || !registered || auth.currentUser?.isAnonymous || busy) return;
    const next = !enabled;
    // Preference is independent from OS permission and from chat notifications.
    // A permission denial must NEVER roll this switch back.
    setAnonArrivalPushPreference(uid, next);
    setEnabled(next);
    setMessage("");
    if (!next) {
      // Best-effort topic unsubscribe: local opt-out works even if offline.
      void setAnonArrivalPushEnabled(false).catch(() => undefined);
      return;
    }
    if (isCapacitorNative()) {
      setBusy(true);
      try {
        const granted = await requestChatNotificationPermission({force:true,forArrival:true});
        if (granted) {
          const ok = await setAnonArrivalPushEnabled(true);
          if (!ok) setMessage(es ? "Los avisos están activos, pero no se pudo completar la suscripción." : "Alerts are on but the subscription did not finish.");
        } else {
          setMessage(es ? "Los avisos internos siguen activados. Autorizá las notificaciones del dispositivo para recibirlas fuera de la app." : "In-app alerts remain on. Allow device notifications for background delivery.");
        }
      } finally { setBusy(false); }
      return;
    }
    if (getBrowserPermission() === "granted") {
      setBusy(true);
      try {
        const ok = await setAnonArrivalPushEnabled(true);
        if (!ok) setMessage(es
          ? "Los avisos quedaron activados. Para recibirlos en segundo plano, repará Web Push desde Notificaciones."
          : "Alerts are enabled. Repair Web Push under Notifications to get background alerts.");
      } finally { setBusy(false); }
    } else if (getBrowserPermission() !== "native") {
      await enableBrowserDelivery();
    }
  }

  if (!registered) return null;
  const needsBrowserPermission = enabled && permission !== "native" && permission !== "granted";

  return (
    <section data-arrival-notification-setting="1" className={
      compact
        ? "rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white"
        : "mx-auto my-5 w-full max-w-xl rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 text-white"
    }>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <BellRing size={18} className="shrink-0 text-violet-300"/>
          <span className="text-sm font-bold">{es ? "Avisos de nuevas conexiones" : "New connection alerts"}</span>
          <button type="button" data-arrival-notification-info="1"
            aria-label={es ? "¿Qué son los avisos de nuevas conexiones?" : "About new connection alerts"}
            aria-expanded={explain}
            onClick={() => setExplain(current => !current)}
            className="shrink-0 rounded-full p-1 text-violet-300 hover:bg-violet-500/15">
            <Info size={18}/>
          </button>
        </div>
        <button type="button" role="switch" aria-checked={enabled}
          aria-label={es ? "Avisos de nuevas conexiones" : "New connection alerts"}
          data-arrival-notification-toggle={enabled ? "on" : "off"}
          disabled={busy} onClick={() => void toggle()}
          className={"relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 " + (enabled ? "bg-violet-500" : "bg-zinc-600")}>
          <span className={"absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all " + (enabled ? "left-7" : "left-1")}/>
        </button>
      </div>
      <p className="mt-2 text-xs text-white/55">
        {es
          ? "Activado por defecto en perfiles web. Te avisa de nuevas conexiones sin depender de las notificaciones de mensajes."
          : "Enabled by default for web profiles. Alerts you to new connections independently of chat notifications."}
      </p>
      {needsBrowserPermission ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-200" role="status">
            {permission === "denied"
              ? (es ? "Tu navegador bloquea los avisos del sistema. Permití Notificaciones para SayItToMe en la configuración de Chrome o Brave." : "Your browser blocks system notifications. Allow notifications for SayItToMe in Chrome or Brave settings.")
              : (es ? "Los avisos internos están activos. Para recibir notificaciones del sistema, autorizá este navegador." : "In-app alerts are on. Allow this browser for system notifications.")}
          </p>
          {permission !== "denied" && permission !== "unsupported" && (
            <button type="button" disabled={busy} onClick={() => void enableBrowserDelivery()}
              data-arrival-browser-permission="1"
              className="rounded-xl border border-violet-400/40 px-3 py-2 text-xs font-bold text-violet-100 disabled:opacity-50">
              {busy ? (es ? "Activando…" : "Enabling…") : (es ? "Permitir avisos del navegador" : "Allow browser alerts")}
            </button>
          )}
        </div>
      ) : null}
      {explain ? (
        <p data-arrival-notification-explanation="1" className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs leading-relaxed text-white/75">
          {es
            ? "Si un perfil o anónimo vuelve a entrar tras 60 segundos fuera, puede anunciarse una nueva conexión. La preferencia está activa sin pedir permisos; Chrome o Brave necesitan tu autorización para mostrar notificaciones del sistema. Podés desactivar estos avisos sin alterar los mensajes."
            : "A returning profile or anonymous visitor can be announced after 60 seconds away. This preference is active independently of browser permission; Chrome or Brave need your authorization for system notifications. Turning it off does not affect messages."}
        </p>
      ) : null}
      {message ? <p role="status" className="mt-2 text-xs text-amber-200">{message}</p> : null}
    </section>
  );
}
