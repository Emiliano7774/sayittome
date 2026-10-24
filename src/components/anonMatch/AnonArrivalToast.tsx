"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { buildProfileAnonChatId } from "@/lib/chat/anonChatId";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { consumeAnonArrivalToastOnce, markAnonArrivalActionHandled } from "@/lib/anonMatch/arrivalToastReceipt";
import { recordNotificationStage } from "@/lib/chat/notificationIncident";

type Arrival = { type:"anon_arrival"|"profile_arrival"; id:string; enteredAt:string; username?:string };
type Notice = { text: string; kind: "offline"|"error"|"waiting" };
const MAX_ENTRY_AGE_MS = 120_000;

/** Immutable event stream: no latest-document overwrite, no polling. */
export default function AnonArrivalToast() {
  const [arrival,setArrival] = useState<Arrival | null>(null);
  const [notice,setNotice] = useState<Notice | null>(null);
  const [opening,setOpening] = useState(false);
  const router=useRouter();
  const isDirectArrivalLanding=usePathname()==="/arrival";
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
    // The one global web-push bootstrap in ChatAlertsProvider now owns token
    // and topic repair for registered profiles and anonymous visitors.
    // ArrivalToast only identifies this open tab so FCM can avoid self-alerts.
    let currentUid="";
    const identifyViewerToWorker=()=>{
      if(typeof navigator==="undefined" || !("serviceWorker" in navigator))return;
      if(typeof Notification==="undefined" || Notification.permission!=="granted")return;
      const uid=currentUid;
      void import("@/lib/chat/chatNotifications")
        .then(({ensureChatNotifyServiceWorker})=>ensureChatNotifyServiceWorker())
        .then(registration=>{
          if((auth.currentUser?.uid||"")!==uid)return;
          registration?.active?.postMessage({type:"sayittome:arrival-viewer",uid});
        }).catch(()=>undefined);
    };
    const stopAuth=onAuthStateChanged(auth,user=>{
      currentUid=user?.uid||"";
      identifyViewerToWorker();
    });
    window.addEventListener("focus",identifyViewerToWorker);
    window.addEventListener("pageshow",identifyViewerToWorker);
    document.addEventListener("visibilitychange",identifyViewerToWorker);
    return ()=>{
      stopAuth();
      window.removeEventListener("focus",identifyViewerToWorker);
      window.removeEventListener("pageshow",identifyViewerToWorker);
      document.removeEventListener("visibilitychange",identifyViewerToWorker);
    };
  },[]);
  useEffect(()=>{
    let unsubscribeDoc:(()=>void)|undefined;
    let loggedIn=false;
    let viewerUid="";
    let stopped=false;
    let retryTimer:number|undefined;
    let retryAttempt=0;
    let replayAfterStreamError=false;
    const scheduleStreamRecovery=()=>{
      if(stopped||retryTimer||!loggedIn||document.hidden)return;
      const delay=Math.min(30_000,1_000*2**Math.min(retryAttempt++,5));
      retryTimer=window.setTimeout(()=>{
        retryTimer=undefined;
        connect();
      },delay);
    };
    const notifyWebForegroundArrival=(raw:Record<string,unknown>, target:{username?:string;anonId?:string})=>{
      if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
      const identity=target.anonId||target.username||"";
      if(!identity||!viewerUid||!getAnonArrivalPushPreference(viewerUid))return;
      const uid=viewerUid;
      const enteredAtMs=Number(raw.enteredAtMs||Date.parse(String(raw.enteredAt||""))||0);
      const href=target.anonId
        ? "/arrival?anonArrival="+encodeURIComponent(target.anonId)
        : "/u/"+encodeURIComponent(target.username||"");
      const title="🌙 Nueva conexión en SayItToMe";
      const body=target.anonId
        ? anonArrivalPublicLabel(target.anonId)+" se acaba de conectar. Tocá para hablarle."
        : "@"+target.username+" se acaba de conectar. Tocá para hablarle.";
      void Promise.all([
        import("@/lib/chat/chatNotifications"),
        import("@/lib/chat/webNotificationDelivery"),
      ]).then(async([{ensureChatNotifyServiceWorker},{deliverWebChatNotification}])=>{
        if(auth.currentUser?.uid!==uid||document.hidden||!getAnonArrivalPushPreference(uid))return;
        const sw=await ensureChatNotifyServiceWorker();
        if(!sw?.active)return;
        await deliverWebChatNotification(sw,title,{
          body,tag:"stm-web-arrival-"+String(raw.type||"")+"-"+identity+"-"+enteredAtMs,
          icon:"/icons/Icon-192.png",badge:"/icons/Icon-192.png",
          data:{type:String(raw.type||""),href,username:target.username||"",
            anonId:target.anonId||"",eventId:String(raw.eventId||enteredAtMs)},
        });
      }).catch(error=>console.warn("[arrival] foreground web notification",String(error)));
    };
    const connect=()=>{
      // A normal listener starts NOW. After a terminal stream error only,
      // replay at most the last two minutes (deduped by event ID).
      // This heals missed 4th/5th/500th entrances without perpetual polling.
      if(stopped)return;
      if(retryTimer){window.clearTimeout(retryTimer);retryTimer=undefined;}
      unsubscribeDoc?.();unsubscribeDoc=undefined;
      if(!loggedIn||document.hidden||!getAnonArrivalPushPreference(viewerUid))return;
      const joinedAt=Date.now()-(replayAfterStreamError?MAX_ENTRY_AGE_MS:2_000);
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
            notifyWebForegroundArrival(raw,{username});
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
          notifyWebForegroundArrival(raw,{anonId:id});
        }
        retryAttempt=0;
        replayAfterStreamError=false;
        displayNext();
      },err=>{
        console.warn("[anon-arrival] event stream unavailable; retrying",err.code||String(err));
        // Firestore's error callback is terminal: without an explicit retry
        // this page stops receiving ALL later reentries until another reload.
        replayAfterStreamError=true;
        unsubscribeDoc?.();unsubscribeDoc=undefined;
        scheduleStreamRecovery();
      });
    };
    const unsubscribeAuth=onAuthStateChanged(auth,user=>{
      loggedIn=Boolean(user);
      viewerUid=user?.uid||"";
      if(!user){pendingArrivals.current=[];currentlyShowing.current=false;setArrival(null);}
      connect();
    });
    const onGeoProfileArrival=(event:Event)=>{
      if(!loggedIn||document.hidden||!getAnonArrivalPushPreference(viewerUid))return;
      const raw=(event as CustomEvent<Record<string,unknown>>).detail||{};
      if(raw.geoTargeted!=="1"||raw.type!=="profile_arrival")return;
      const username=String(raw.username||"").trim();
      if(!/^[\\p{L}\\p{N}_.-]{2,40}$/u.test(username))return;
      if(String(raw.originUid||"")===viewerUid)return;
      const timestamp=Number(String(raw.eventId||"").split(":").at(-1)||0);
      if(!Number.isFinite(timestamp)||timestamp<=0||Date.now()-timestamp>MAX_ENTRY_AGE_MS)return;
      const enteredAt=new Date(timestamp).toISOString();
      const key="profile:"+username;
      if(!consumeAnonArrivalToastOnce(viewerUid,key,enteredAt,Date.now()))return;
      pendingArrivals.current.push({type:"profile_arrival",id:key,username,enteredAt});
      displayNext();
    };
    document.addEventListener("visibilitychange",connect);
    window.addEventListener("online",connect);
    window.addEventListener("sayittome:geo-profile-arrival",onGeoProfileArrival);
    window.addEventListener("sayittome:anon-arrival-prefs",connect);
    // Retain the cheap 15-minute refresh, with immediate bounded error recovery.
    // There is NO added periodic Firestore polling.
    const reconnectTimer=window.setInterval(()=>{
      if(loggedIn&&!document.hidden)connect();
    },15*60_000);
    return ()=>{
      stopped=true;
      if(retryTimer)window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange",connect);
      window.removeEventListener("online",connect);
      window.removeEventListener("sayittome:geo-profile-arrival",onGeoProfileArrival);
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
      window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:detail.status}}));
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
    window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:"opening"}}));
    currentlyShowing.current=false;
    setArrival(null);
    setNotice(null);
    window.setTimeout(displayNext,0);
    try{
      const openStarted = Date.now();
      recordNotificationStage("arrival_open", true, "start");
      // Resolve one stable principal *before* the preflight. Auth adoption or
      // hydration can finish while the request is in flight; reading
      // auth.currentUser afterwards could silently choose the wrong chat route.
      const params=new URLSearchParams({anonId:id});
      const targetStarted = Date.now();
      const [caller, res] = await Promise.all([
        resolveLiveAnonMatchCaller(),
        fetchAnonMatch("/api/anon-match/arrival-target?"+params.toString(),{
          method:"POST",
          body:JSON.stringify(readDiscoveryPayload()),
          cache:"no-store",
        }),
      ]);
      recordNotificationStage("arrival_open_caller", true, String(Date.now() - openStarted));
      recordNotificationStage("arrival_open_target", res.ok, String(Date.now() - targetStarted));
      markAnonArrivalActionHandled(caller.user.uid,id);
      // The server checks current presence, closed state, DND and audience.
      // The display card can legitimately outlive the anonymous session.
      const result=await res.json().catch(()=>({}));
      if(!res.ok||!result.available){
        window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:"unavailable"}}));
        setNotice({kind:"offline",text:"Este anónimo ya no está disponible."});
        return;
      }
      setNotice({kind:"waiting",text:"Abriendo chat…"});
      if (caller.isRegisteredProfile) {
        if (!auth.currentUser || auth.currentUser.uid !== caller.user.uid) {
          window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:"error"}}));
          setNotice({kind:"error",text:"La sesión cambió. Tocá nuevamente para abrir el chat."});
          return;
        }
        // Exactly the same direct profile-anon route as tapping this visitor
        // in Shuffle. No random-matching request or invitation.
        const visitorChatId=String(result.visitorChatId||"").trim();
        if (!visitorChatId) {
          window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:"error"}}));
          setNotice({kind:"error",text:"No se pudo identificar el chat. Intentá nuevamente."});
          return;
        }
        const ownUsername=String(result.ownUsername||"").trim();
        const safetyWarningTitles=Array.isArray(result.safetyWarningTitles)
          ? result.safetyWarningTitles.map((row: unknown)=>String(row||"").trim()).filter(Boolean)
          : [];
        if (ownUsername) {
          prefetchChatThread(buildProfileAnonChatId(visitorChatId, ownUsername));
        }
        const navStarted = Date.now();
        const navigated=await openVisitorChat(router,visitorChatId,id,{
          ensureNavigation:true,
          authenticatedUser:caller.user,
          arrivalPreflight:{ ownUsername, safetyWarningTitles },
        });
        recordNotificationStage("arrival_open_nav", navigated, String(Date.now() - navStarted));
        if (!navigated) {
          window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:"error"}}));
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
      window.dispatchEvent(new CustomEvent("sayittome:anon-arrival-deeplink-status",{detail:{status:"error"}}));
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
      // Authentication is awaited inside open(), so a fixed delay adds only
      // black-screen latency without preventing an auth/hydration race.
      window.setTimeout(()=>void open(id),0);
    };
    consume();window.addEventListener("pageshow",consume);window.addEventListener("popstate",consume);
    return ()=>{window.removeEventListener("pageshow",consume);window.removeEventListener("popstate",consume);};
  },[open]);
  // Deep-linked chat opening paints pure black; the landing itself displays
  // an error only when opening actually fails. No floating loading banner.
  if(isDirectArrivalLanding)return null;
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