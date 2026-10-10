"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getStoredAnonMatchAlias } from "@/lib/anonMatch/anonMatchSession";
import { anonArrivalPublicLabel, isAnonArrivalAlias } from "@/lib/anonMatch/anonArrival";
import { fetchAnonMatch } from "@/lib/anonMatch/fetchAnonMatch";
import { readDiscoveryPayload } from "@/lib/shuffle/audiencePayload";

type Arrival = { id: string; enteredAt: string };
type Notice = { text: string; kind: "offline"|"error"|"waiting" };
const MAX_ENTRY_AGE_MS = 30_000;

/** One Firestore document listener, shared by every client; no 20s API polling. */
export default function AnonArrivalToast() {
  const [arrival,setArrival] = useState<Arrival | null>(null);
  const [notice,setNotice] = useState<Notice | null>(null);
  const [opening,setOpening] = useState(false);
  const lastKey=useRef("");
  const handledHref=useRef("");
  const activeTarget=useRef("");
  const openInFlight=useRef(false);

  useEffect(()=>{
    let unsubscribeDoc:(()=>void)|undefined;
    let loggedIn=false;
    const connect=()=>{
      // Only foreground viewers need an arrival banner. Keeping a listener
      // alive behind a hidden tab would charge one Firestore read for every
      // entrance even though the banner cannot be seen.
      unsubscribeDoc?.();unsubscribeDoc=undefined;
      if(!loggedIn||document.hidden)return;
      unsubscribeDoc=onSnapshot(doc(db,"anon_arrival_announcements","latest"),snap=>{
        if(!snap.exists())return;
        const raw=snap.data();
        const id=String(raw.anonId||"").trim();
        const enteredAt=String(raw.enteredAt||"").trim();
        const entered=Date.parse(enteredAt);
        const key=id+":"+enteredAt;
        const current=Date.now();
        if(!isAnonArrivalAlias(id)||!Number.isFinite(entered)||raw.audience!=="public")return;
        if(key===lastKey.current)return;
        lastKey.current=key;
        if(id===getStoredAnonMatchAlias())return;
        if(entered>current+10_000||current-entered>MAX_ENTRY_AGE_MS)return;
        setNotice(null);setArrival({id,enteredAt});
      },err=>console.warn("[anon-arrival] realtime unavailable",err.code||String(err)));
    };
    const unsubscribeAuth=onAuthStateChanged(auth,user=>{
      loggedIn=Boolean(user);
      if(!user)lastKey.current="";
      connect();
    });
    document.addEventListener("visibilitychange",connect);
    return ()=>{
      document.removeEventListener("visibilitychange",connect);
      unsubscribeDoc?.();
      unsubscribeAuth();
    };
  },[]);
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
  useEffect(()=>{if(!arrival)return;const t=window.setTimeout(()=>setArrival(null),5000);return ()=>clearTimeout(t);},[arrival]);
  useEffect(()=>{if(!notice)return;const t=window.setTimeout(()=>setNotice(null),5000);return ()=>clearTimeout(t);},[notice]);

  const open=useCallback(async(id:string)=>{
    if(!isAnonArrivalAlias(id)||openInFlight.current)return;
    openInFlight.current=true;activeTarget.current=id;setOpening(true);setArrival(null);setNotice(null);
    try{
      // The server checks current presence, closed state, DND and audience.
      // The display card can legitimately outlive the anonymous session.
      const params=new URLSearchParams({anonId:id});
      const res=await fetchAnonMatch("/api/anon-match/arrival-target?"+params.toString(),{method:"POST",body:JSON.stringify(readDiscoveryPayload()),cache:"no-store"});
      const result=await res.json().catch(()=>({}));
      if(!res.ok||!result.available){
        setNotice({kind:"offline",text:"Este anónimo ya no está disponible."});
        return;
      }
      setNotice({kind:"waiting",text:"Conectando con el anónimo…"});
      window.dispatchEvent(new CustomEvent("sayittome:anon-direct-target-request",{
        detail:{targetAnonId:id,source:"arrival"},
      }));
      // The chat provider emits an explicit opened / invited / unavailable
      // status after it has handled the request; never claim a chat opened yet.
    }catch(error){
      console.warn("[anon-arrival] open failed",String(error));
      setNotice({kind:"error",text:"No se pudo abrir el chat. Intentá nuevamente."});
    }finally{openInFlight.current=false;setOpening(false);}
  },[]);

  useEffect(()=>{
    const consume=()=>{
      const url=new URL(window.location.href);
      const id=url.searchParams.get("anonArrival")||"";
      if(!isAnonArrivalAlias(id)||handledHref.current===id+url.pathname)return;
      handledHref.current=id+url.pathname;
      url.searchParams.delete("anonArrival");
      window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
      window.setTimeout(()=>void open(id),350);
    };
    consume();window.addEventListener("pageshow",consume);window.addEventListener("popstate",consume);
    return ()=>{window.removeEventListener("pageshow",consume);window.removeEventListener("popstate",consume);};
  },[open]);
  if(!arrival&&!notice&&!opening)return null;
  const label=arrival?anonArrivalPublicLabel(arrival.id):"";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[10000] flex justify-center px-4">
      {arrival ? <button type="button" onClick={()=>void open(arrival.id)} className="pointer-events-auto flex w-full max-w-[370px] items-center gap-3 rounded-2xl border border-violet-400/20 bg-[#14111e]/95 px-4 py-3 text-left text-white shadow-2xl backdrop-blur-xl" aria-label={"Hablar con el anónimo "+label}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300"><MessageCircle size={19}/></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">Anónimo {label} acaba de entrar</span><span className="block text-xs text-white/60">Tocá para empezar a hablar</span></span>
        <span className="shrink-0 text-[10px] font-semibold text-violet-300">ABRIR</span>
      </button> :
      <div role="status" className="pointer-events-none w-full max-w-[370px] rounded-2xl border border-violet-400/20 bg-[#14111e]/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
        {opening?"Comprobando conexión…":notice?.text}
      </div>}
    </div>
  );
}