"use client";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useLocale } from "@/contexts/LocaleContext";
import { areChatNotificationsEnabled, setChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
import { requestChatNotificationPermission } from "@/lib/chat/chatNotifications";
import { setAnonArrivalPushEnabled } from "@/lib/chat/fcmPush";
import { getAnonArrivalPushPreference, setAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";

export default function AnonArrivalPushSettings() {
  const { locale } = useLocale();
  const [enabled,setEnabled] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const es = locale === "es";
  useEffect(() => {
    const sync=()=>setEnabled(getAnonArrivalPushPreference(auth.currentUser?.uid || ""));
    sync();
    window.addEventListener("sayittome:anon-arrival-prefs",sync);
    return ()=>window.removeEventListener("sayittome:anon-arrival-prefs",sync);
  },[]);
  async function toggle() {
    const uid=auth.currentUser?.uid || "";
    if(!uid || busy)return;
    const next=!enabled;
    setBusy(true);setError("");
    try {
      const already=areChatNotificationsEnabled();
      if(next) {
        setChatNotificationsEnabled(true);
        const granted=await requestChatNotificationPermission({force:true});
        if(!granted){if(!already)setChatNotificationsEnabled(false);throw Error("permission");}
      }
      const ok=await setAnonArrivalPushEnabled(next);
      if(!ok)throw Error("subscription");
      setAnonArrivalPushPreference(uid,next);setEnabled(next);
    }catch{setError(es ? "No se pudo cambiar el aviso. Revisá los permisos." : "Could not update notifications. Check permissions.");
    }finally{setBusy(false);}
  }
  return (
    <section id="anon-alerts" className="mx-auto my-5 flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 text-white">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold"><BellRing size={16} className="text-violet-300" />{es?"Avisos de nuevos anónimos":"New anonymous arrivals"}</p>
        <p className="mt-1 text-xs text-white/55">{es?"Opcional. Recibí avisos en el celular cuando alguien anónimo entre a la app.":"Optional. Get a phone notification when someone anonymous joins."}</p>
        {error ? <p role="alert" className="mt-1 text-xs text-rose-300">{error}</p> : null}
      </div>
      <button type="button" onClick={()=>void toggle()} disabled={busy} aria-pressed={enabled} className={"shrink-0 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-40 "+(enabled?"bg-violet-500 text-white":"border border-white/20 bg-white/10 text-white/80")}>{busy?"…":enabled?(es?"Activado":"On"):(es?"Activar":"Enable")}</button>
    </section>
  );
}