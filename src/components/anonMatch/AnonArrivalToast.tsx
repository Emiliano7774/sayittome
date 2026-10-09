"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { auth } from "@/lib/firebase";
import { anonArrivalPublicLabel, isAnonArrivalAlias, isAnonArrivalGloballyVisible } from "@/lib/anonMatch/anonArrival";

type Visitor = {visitorMatchAnonId?:string; enteredAt?:string; lastActive?:string; authUid?:string; visitorSessionClosed?:boolean; visitorAvailable?:boolean; visibilidadPaises?:string[]; visibilidadProvincias?:string[]};
type Arrival = {id:string;enteredAt:string};
const POLL_MS=20_000;
const FRESH_MS=60_000;

export default function AnonArrivalToast() {
  const [arrival,setArrival]=useState<Arrival|null>(null);
  const seen=useRef(new Set<string>());
  const initialized=useRef(false);
  const inFlight=useRef(false);
  const handledHref=useRef("");

  const scan=useCallback(async()=>{
    if(document.hidden||inFlight.current)return;
    inFlight.current=true;
    try {
      const res=await fetch("/api/shuffle?visitors=1",{cache:"default"});
      if(!res.ok)return;
      const payload=await res.json() as {profiles?:Visitor[];ok?:boolean};
      if(!payload.ok||!Array.isArray(payload.profiles))return;
      const now=Date.now();
      const next:Arrival[]=[];
      for(const v of payload.profiles){
        const id=String(v.visitorMatchAnonId||"");
        const enteredAt=String(v.enteredAt||"");
        const entered=Date.parse(enteredAt);
        if(!isAnonArrivalAlias(id)||!Number.isFinite(entered)||entered>now+10_000)continue;
        const key=id+":"+enteredAt;
        const known=seen.current.has(key);
        seen.current.add(key);
        if(known||!initialized.current)continue;
        if(now-entered>FRESH_MS||now-entered<0)continue;
        if(String(v.authUid||"")===auth.currentUser?.uid)continue;
        if(v.visitorSessionClosed === true || v.visitorAvailable === false)continue;
        if(!isAnonArrivalGloballyVisible({paises:v.visibilidadPaises,provincias:v.visibilidadProvincias}))continue;
        // Old 3-hour discovery cards must never trigger an arrival toast.
        const lastSeen=Date.parse(String(v.lastActive||""));
        if(!Number.isFinite(lastSeen)||now-lastSeen>90_000)continue;
        next.push({id,enteredAt});
      }
      if(seen.current.size>700)seen.current=new Set([...seen.current].slice(-300));
      initialized.current=true;
      next.sort((a,b)=>Date.parse(a.enteredAt)-Date.parse(b.enteredAt));
      if(next.length)setArrival(next[next.length-1]);
    }catch{}finally{inFlight.current=false;}
  },[]);

  useEffect(()=>{
    void scan();
    const timer=window.setInterval(()=>void scan(),POLL_MS);
    const onFocus=()=>{if(!document.hidden)void scan();};
    document.addEventListener("visibilitychange",onFocus);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onFocus);};
  },[scan]);
  useEffect(()=>{
    if(!arrival)return;
    const timer=window.setTimeout(()=>setArrival(null),2000);
    return ()=>window.clearTimeout(timer);
  },[arrival]);

  const open=useCallback((id:string)=>{
    if(!isAnonArrivalAlias(id))return;
    setArrival(null);
    // The existing target handler checks the server-bound identity, current
    // contactability, audience filters and blocks before creating a chat.
    window.dispatchEvent(new CustomEvent("sayittome:anon-direct-target-request",{detail:{targetAnonId:id}}));
  },[]);

  useEffect(()=>{
    const consume=()=>{
      const url=new URL(window.location.href);
      const id=url.searchParams.get("anonArrival")||"";
      if(!isAnonArrivalAlias(id)||handledHref.current===id+url.pathname)return;
      handledHref.current=id+url.pathname;
      url.searchParams.delete("anonArrival");
      window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
      window.setTimeout(()=>open(id),350);
    };
    consume();
    window.addEventListener("pageshow",consume);
    window.addEventListener("popstate",consume);
    return ()=>{window.removeEventListener("pageshow",consume);window.removeEventListener("popstate",consume);};
  },[open]);

  if(!arrival)return null;
  const label=anonArrivalPublicLabel(arrival.id);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[10000] flex justify-center px-4">
      <button type="button" onClick={()=>open(arrival.id)} className="pointer-events-auto flex w-full max-w-[370px] items-center gap-3 rounded-2xl border border-violet-400/20 bg-[#14111e]/95 px-4 py-3 text-left text-white shadow-2xl backdrop-blur-xl" aria-label={"Hablar con el anónimo "+label}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300"><MessageCircle size={19}/></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">Anónimo {label} acaba de entrar</span><span className="block text-xs text-white/60">Tocá para empezar a hablar</span></span>
        <span className="shrink-0 text-[10px] font-semibold text-violet-300">ABRIR</span>
      </button>
    </div>
  );
}