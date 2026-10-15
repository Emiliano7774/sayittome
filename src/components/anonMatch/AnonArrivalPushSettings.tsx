"use client";

import { BellRing, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useLocale } from "@/contexts/LocaleContext";
import { areChatNotificationsEnabled, setChatNotificationsEnabled } from "@/lib/chat/chatNotificationPrefs";
import { requestChatNotificationPermission } from "@/lib/chat/chatNotifications";
import { setAnonArrivalPushEnabled } from "@/lib/chat/fcmPush";
import { getAnonArrivalPushPreference, setAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";

type Props = { compact?: boolean };
export default function AnonArrivalPushSettings({compact=false}:Props) {
  const {locale}=useLocale();
  const es=locale==="es";
  const [enabled,setEnabled]=useState(false);
  const [registered,setRegistered]=useState(false);
  const [busy,setBusy]=useState(false);
  const [explain,setExplain]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    const sync=()=>{
      const user=auth.currentUser;
      const isRegistered=Boolean(user && !user.isAnonymous);
      setRegistered(isRegistered);
      setEnabled(isRegistered ? getAnonArrivalPushPreference(user?.uid||"") : false);
    };
    sync();
    const unsubscribe=auth.onAuthStateChanged(sync);
    window.addEventListener("sayittome:anon-arrival-prefs",sync);
    window.addEventListener("sayittome:chat-notification-prefs",sync);
    return ()=>{unsubscribe();window.removeEventListener("sayittome:anon-arrival-prefs",sync);window.removeEventListener("sayittome:chat-notification-prefs",sync);};
  },[]);

  async function toggle() {
    const uid=auth.currentUser?.uid||"";
    if (!uid||!registered||auth.currentUser?.isAnonymous||busy)return;
    const next=!enabled;
    setBusy(true);setError("");
    try {
      const already=areChatNotificationsEnabled();
      if (next) {
        if (!already)setChatNotificationsEnabled(true);
        const granted=await requestChatNotificationPermission({force:true});
        if (!granted) {
          if (!already)setChatNotificationsEnabled(false);
          throw new Error("permission");
        }
      }
      const ok=await setAnonArrivalPushEnabled(next);
      if (!ok) {
        if (next && !already)setChatNotificationsEnabled(false);
        throw new Error("subscription");
      }
      // Explicit choice persists separately from message and story preferences.
      setAnonArrivalPushPreference(uid,next);
      setEnabled(next);
    } catch {
      setError(es?"No se pudo guardar. Revisá los permisos e intentá de nuevo.":"Could not save. Check permissions and try again.");
    } finally {setBusy(false);}
  }

  // Anonymous sessions have arrival alerts permanently enabled; no opt-out
  // control or explanatory panel should appear anywhere in their interface.
  if (!registered) return null;

  return (
    <section data-arrival-notification-setting="1" className={
      compact
      ? "rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white"
      : "mx-auto my-5 w-full max-w-xl rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 text-white"
    }>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <BellRing size={18} className="shrink-0 text-violet-300"/>
          <span className="text-sm font-bold">{es?"Avisos de nuevas conexiones":"New connection alerts"}</span>
          <button type="button" data-arrival-notification-info="1"
            aria-label={es?"¿Qué son los avisos de nuevas conexiones?":"About new connection alerts"}
            aria-expanded={explain}
            onClick={()=>setExplain(current=>!current)}
            className="shrink-0 rounded-full p-1 text-violet-300 hover:bg-violet-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
            <Info size={18}/>
          </button>
        </div>
        <button type="button" role="switch" aria-checked={enabled}
          aria-label={es?"Avisos de nuevas conexiones":"New connection alerts"}
          data-arrival-notification-toggle={enabled?"on":"off"}
          disabled={busy} onClick={()=>void toggle()}
          className={"relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 "+(enabled?"bg-violet-500":"bg-zinc-600")}>
          <span className={"absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all "+(enabled?"left-7":"left-1")}/>
        </button>
      </div>
      <p className="mt-2 text-xs text-white/55">
        {es?"Notificarme cuando alguien se conecte. Independiente de mensajes e historias.":"Notify me when someone connects. Separate from chat and story notifications."}
      </p>
      {explain?<p data-arrival-notification-explanation="1" className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs leading-relaxed text-white/75">
        {es
          ?"Te avisa cuando entra un perfil público (@usuario) o un visitante anónimo (Anónimo-código). Tocando un aviso de anónimo podés empezar a hablarle directamente si sigue disponible. Apagarlo solo silencia las nuevas conexiones: los mensajes, historias y demás avisos siguen igual. El dispositivo o navegador también debe permitir las notificaciones."
          :"Alerts you when a public profile (@username) or anonymous visitor (Anonymous-code) joins. Tap an anonymous visitor to start chatting if still available. Turning this off does not affect messages, stories or other alerts. Your device or browser must also allow notifications."}
      </p>:null}
      {error?<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>:null}
    </section>
  );
}
