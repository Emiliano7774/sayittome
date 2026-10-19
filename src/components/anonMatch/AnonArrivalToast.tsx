"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getAnonArrivalPushPreference } from "@/lib/chat/anonArrivalPrefs";
import { getStoredAnonMatchAlias } from "@/lib/anonMatch/anonMatchSession";
import { anonArrivalPublicLabel, isAnonArrivalAlias } from "@/lib/anonMatch/anonArrival";
import { fetchAnonMatch, resolveLiveAnonMatchCaller } from "@/lib/anonMatch/fetchAnonMatch";
import { readDiscoveryPayload } from "@/lib/shuffle/audiencePayload";
import { openVisitorChat } from "@/lib/shuffle/shuffleVisitorNavigation";
import { consumeAnonArrivalToastOnce, markAnonArrivalActionHandled } from "@/lib/anonMatch/arrivalToastReceipt";

type Arrival = { type:"anon_arrival"|"profile_arrival"; id:string; enteredAt:string; username?:string };
type Notice = { text: string; kind: "offline"|"error"|"waiting" };
const MAX_ENTRY_AGE_MS = 120_000;
const ANON_AUTO_SUBSCRIBE_KEY = "sayittome:anonymous-arrival-auto-subscribe-v1:";
const PROFILE_AUTO_SUBSCRIBE_KEY = "sayittome:profile-arrival-auto-subscribe-v1:";
const attemptedAnonymousSubscriptions = new Set<string>();

/** Immutable event stream: no latest-document overwrite, no polling. */
export default function AnonArrivalToast() {
  const [arrival,setArrival] = useState<Arrival | null>(null);
  const [notice,setNotice] = useState<Notice | null>(null);
  const [opening,setOpening] = useState(false);
  const router=useRouter();
  const pendingArrivals=useRef<Arrival[]>([]);
  const currentlyShowing=useRef(false);
  const displayNext=useCallback(()=>{
    if(currentlyShowing.current)return;
    // Arrivals already expired while a long queue drained must not claim to
    // be online. Every eligible new event is still processed and deduplicated.
    while(pendingArrivals.current.length){
      const item=pendingArrivals.current.shift()!;
      if(Date.now()-Date.parse(item.enteredAt)>MAX_ENTRY_AGE_MS)continue;
      currentlyShowing.current=true;
      setNotice(null);
      setArrival(item);
      return;
    }
  },[]);
  const handledHref=useRef("");
  const activeTarget=useRef("");
  const openInFlight=useRef(false);

  useEffect(()=>{
    // One auto topic reconciliation serves anonymous and registered WEB users.
    // It never requests OS permission: only the existing dialog/settings can.
    let currentUid="";
    let isAnon=false;
    const subscribeIfPermitted=()=>{
      if (!currentUid || typeof Notification === "undefined" ||
          Notification.permission !== "granted") return;
      if (!isAnon && !getAnonArrivalPushPreference(currentUid)) return;
      const identity=(isAnon ? "anon:" : "profile:")+currentUid;
      if (attemptedAnonymousSubscriptions.has(identity)) return;
      const key=(isAnon ? ANON_AUTO_SUBSCRIBE_KEY : PROFILE_AUTO_SUBSCRIBE_KEY)+currentUid;
      const now=Date.now();
      try {
        if (Number(window.sessionStorage.getItem(key)||0)>now) return;
        window.sessionStorage.setItem(key,String(now+30_000));
      } catch { /* private browsing may refuse sessionStorage */ }
      attemptedAnonymousSubscriptions.add(identity);
      void import("@/lib/chat/fcmPush")
        .then(({setAnonArrivalPushEnabled})=>setAnonArrivalPushEnabled(true))
        .then(ok=>{
          try {
            window.sessionStorage.setItem(key,String(Date.now()+(ok ? 60*60_000 : 30_000)));
          } catch { /* retry next focus with no storage */ }
        }).catch(()=>undefined)
        .finally(()=>attemptedAnonymousSubscriptions.delete(identity));
    };
    const stopAuth=onAuthStateChanged(auth,user=>{
      currentUid=user?.uid||"";
      isAnon=Boolean(user?.isAnonymous);
      subscribeIfPermitted();
    });
    window.addEventListener("focus",subscribeIfPermitted);
    window.addEventListener("sayittome:anon-arrival-prefs",subscribeIfPermitted);
    window.addEventListener("sayittome:chat-notification-prefs",subscribeIfPermitted);
    return ()=>{
      stopAuth();
      window.removeEventListener("focus",subscribeIfPermitted);
      window.removeEventListener("sayittome:anon-arrival-prefs",subscribeIfPermitted);
      window.removeEventListener("sayittome:chat-notification-prefs",subscribeIfPermitted);
    };
  },[]);

  useEffect(()=>{
    let unsubscribeDoc:(()=>void)|undefined;
    let loggedIn=false;
    let viewerUid="";
    const connect=()=>{
      // A new listener starts from NOW, so opening a tab never downloads
      // history. Events while hidden are owned by OS push, not Firestore reads.
      unsubscribeDoc?.();unsubscribeDoc=undefined;
      if(!loggedIn||document.hidden||!getAnonArrivalPushPreference(viewerUid))return;
      const joinedAt=Date.now()-2_000;
      const arrivalsQuery=query(
        collection(db,"connection_arrival_events"),
        where("enteredAtMs",">=",joinedAt),
      );
      unsubscribeDoc=onSnapshot(arrivalsQuery,snap=>{
        const arrivals=snap.docChanges()
          .filter(change=>change.type==="added")
          .map(change=>change.doc.data())
          .sort((a,b)=>Number(a.enteredAtMs||0)-Number(b.enteredAtMs||0));
        for(const raw of arrivals){
          const enteredAt=String(raw.enteredAt||"").trim();
          const entered=Date.parse(enteredAt);
          const current=Date.now();
          if(!Number.isFinite(entered)||raw.audience!=="public")continue;
          if(entered>current+10_000||current-entered>MAX_ENTRY_AGE_MS)continue;
          if(raw.type==="profile_arrival"){
            const username=String(raw.username||"").trim();
            if(!/^[\p{L}\p{N}_.-]{2,40}$/u.test(username))continue;
            if(String(raw.originUid||"")===viewerUid)continue;
            const key="profile:"+username;
            if(!consumeAnonArrivalToastOnce(viewerUid,key,enteredAt,current))continue;
            pendingArrivals.current.push({type:"profile_arrival",id:key,username,enteredAt});
            continue;
          }
          const id=String(raw.anonId||"").trim();
          if(raw.type!=="anon_arrival"||!isAnonArrivalAlias(id))continue;
          if(id===getStoredAnonMatchAlias())continue;
          if(new URLSearchParams(window.location.search).get("anonArrival")===id){
            markAnonArrivalActionHandled(viewerUid,id,current);
            continue;
          }
          if(!consumeAnonArrivalToastOnce(viewerUid,id,enteredAt,current))continue;
          pendingArrivals.current.push({type:"anon_arrival",id,enteredAt});
        }
        displayNext();
      },err=>console.warn("[anon-arrival] event stream unavailable",err.code||String(err)));
    };
    const unsubscribeAuth=onAuthStateChanged(auth,user=>{
      loggedIn=Boolean(user);
      viewerUid=user?.uid||"";
      if(!user){pendingArrivals.current=[];currentlyShowing.current=false;setArrival(null);}
      connect();
    });
    document.addEventListener("visibilitychange",connect);
    window.addEventListener("sayittome:anon-arrival-prefs",connect);
    // Refresh only every 15 minutes while visible to bound query growth.
    // No periodic database reads/polling are performed.
    const reconnectTimer=window.setInterval(()=>{
      if(loggedIn&&!document.hidden)connect();
    },15*60_000);
    return ()=>{
      document.removeEventListener("visibilitychange",connect);
      window.removeEventListener("sayittome:anon-arrival-prefs",connect);
      window.clearInterval(reconnectTimer);
      unsubscribeDoc?.();
      unsubscribeAuth();
    };
  },[displayNext]);
  useEffect(()=>{
    const onStatus=(event:Event)=>{
      const detail=(event as CustomEvent<{targetAnonId?:string;status?:string}>).detail;
      if(!detail||detail.targetAnonId!==activeTarget.current)return;
      const byStatus:Record<string,string>={
        opened:"",
        invited:"Invitación enviada. Esperando que la acepte.",
        unavailable:"Este anónimo ya se desconectó.",
        consent_required:"Aceptá las condiciones de Shuffle para hablar.",
        busy:"Ya hay otra conversación en curso.",
        error:"No se pudo abrir el chat. Intentá nuevamente.",
      };
      const text=byStatus[String(detail.status||"")];
      if(text===undefined)return;
      setOpening(false);setNotice(text?{kind:detail.status==="unavailable"?"offline":detail.status==="invited"?"waiting":"error",text}:null);
    };
    window.addEventListener("sayittome:anon-arrival-open-status",onStatus);
    return ()=>window.removeEventListener("sayittome:anon-arrival-open-status",onStatus);
  },[]);
  useEffect(()=>{
    if(!arrival)return;
    const timer=window.setTimeout(()=>{
      currentlyShowing.current=false;
      setArrival(null);
      window.setTimeout(displayNext,0);
    },3000);
    return ()=>clearTimeout(timer);
  },[arrival,displayNext]);
  useEffect(()=>{if(!notice)return;const t=window.setTimeout(()=>setNotice(null),5000);return ()=>clearTimeout(t);},[notice]);

  const open=useCallback(async(id:string)=>{
    if(!isAnonArrivalAlias(id)||openInFlight.current)return;
    markAnonArrivalActionHandled(auth.currentUser?.uid || "",id);
    openInFlight.current=true;activeTarget.current=id;
    setOpening(true);
    currentlyShowing.current=false;
    setArrival(null);
    setNotice(null);
    window.setTimeout(displayNext,0);
    try{
      // Resolve one stable principal *before* the preflight. Auth adoption or
      // hydration can finish while the request is in flight; reading
      // auth.currentUser afterwards could silently choose the wrong chat route.
      const caller = await resolveLiveAnonMatchCaller();
      markAnonArrivalActionHandled(caller.user.uid,id);
      // The server checks current presence, closed state, DND and audience.
      // The display card can legitimately outlive the anonymous session.
      const params=new URLSearchParams({anonId:id});
      const res=await fetchAnonMatch("/api/anon-match/arrival-target?"+params.toString(),{method:"POST",body:JSON.stringify(readDiscoveryPayload()),cache:"no-store"});
      const result=await res.json().catch(()=>({}));
      if(!res.ok||!result.available){
        setNotice({kind:"offline",text:"Este anónimo ya no está disponible."});
        return;
      }
      setNotice({kind:"waiting",text:"Abriendo chat…"});
      if (caller.isRegisteredProfile) {
        if (!auth.currentUser || auth.currentUser.uid !== caller.user.uid) {
          setNotice({kind:"error",text:"La sesión cambió. Tocá nuevamente para abrir el chat."});
          return;
        }
        // Exactly the same direct profile-anon route as tapping this visitor
        // in Shuffle. No random-matching request or invitation.
        const visitorChatId=String(result.visitorChatId||"").trim();
        if (!visitorChatId) {
          setNotice({kind:"error",text:"No se pudo identificar el chat. Intentá nuevamente."});
          return;
        }
        const navigated=await openVisitorChat(router,visitorChatId,id,{ensureNavigation:true});
        if (!navigated) {
          setNotice({kind:"error",text:"No se pudo abrir el chat. Intentá nuevamente."});
        } else {
          setNotice(null);
        }
        return;
      }
      window.dispatchEvent(new CustomEvent("sayittome:anon-direct-target-request",{
        detail:{targetAnonId:id,source:"arrival"},
      }));
    }catch(error){
      console.warn("[anon-arrival] open failed",String(error));
      setNotice({kind:"error",text:"No se pudo abrir el chat. Intentá nuevamente."});
    }finally{openInFlight.current=false;setOpening(false);}
  },[router,displayNext]);

  useEffect(()=>{
    const consume=()=>{
      const url=new URL(window.location.href);
      const id=url.searchParams.get("anonArrival")||"";
      if(!isAnonArrivalAlias(id)||handledHref.current===id+url.pathname)return;
      handledHref.current=id+url.pathname;
      markAnonArrivalActionHandled(auth.currentUser?.uid || "",id);
      url.searchParams.delete("anonArrival");
      window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
      window.setTimeout(()=>void open(id),350);
    };
    consume();window.addEventListener("pageshow",consume);window.addEventListener("popstate",consume);
    return ()=>{window.removeEventListener("pageshow",consume);window.removeEventListener("popstate",consume);};
  },[open]);
  if(!arrival&&!notice&&!opening)return null;
  const label=arrival?.type==="profile_arrival"
    ? "@"+String(arrival.username||"")
    : arrival ? "Anónimo "+anonArrivalPublicLabel(arrival.id) : "";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[10000] flex justify-center px-4">
      {arrival ? <button type="button" onClick={()=>{
        if(arrival.type==="profile_arrival"&&arrival.username){
          currentlyShowing.current=false;
          setArrival(null);
          window.setTimeout(displayNext,0);
          router.push("/u/"+encodeURIComponent(arrival.username));
          return;
        }
        void open(arrival.id);
      }} className="pointer-events-auto flex w-full max-w-[370px] items-center gap-3 rounded-2xl border border-violet-400/20 bg-[#14111e]/95 px-4 py-3 text-left text-white shadow-2xl backdrop-blur-xl" aria-label={"Hablar con "+label}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300"><MessageCircle size={19}/></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{label} acaba de entrar</span><span className="block text-xs text-white/60">Tocá para hablarle</span></span>
        <span className="shrink-0 text-[10px] font-semibold text-violet-300">ABRIR</span>
      </button> :
      <div role="status" className="pointer-events-none w-full max-w-[370px] rounded-2xl border border-violet-400/20 bg-[#14111e]/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
        {opening?"Comprobando conexión…":notice?.text}
      </div>}
    </div>
  );
}