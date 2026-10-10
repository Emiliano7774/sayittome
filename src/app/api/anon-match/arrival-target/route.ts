import { NextResponse } from "next/server";
import { pickAvailableMatchTarget } from "@/lib/anonMatch/matchPool";
import { lookupAnonMatchAliasBinding } from "@/lib/anonMatch/anonMatchAliasAdmin";
import { verifyAnonMatchCaller } from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read-only preflight on click; cannot create a phantom chat or a match. */
export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    const anonId = String(new URL(req.url).searchParams.get("anonId") || "").trim();
    if (!/^anon_[a-z0-9_]{6,80}$/i.test(anonId)) {
      return NextResponse.json({available:false,error:"invalid_target"}, {status:400,headers:{"Cache-Control":"no-store"}});
    }
    const data = await req.json().catch(()=>({}));
    const matched = await pickAvailableMatchTarget({
      preferredAnonId:anonId,
      allowExistingChatsForDirectOpen:true,
      viewerPais:String(data.pais||"").slice(0,100),
      viewerProvincia:String(data.provincia||"").slice(0,100),
      verPaises:Array.isArray(data.verPaises)?data.verPaises.slice(0,100):[],
      verProvincias:Array.isArray(data.verProvincias)?data.verProvincias.slice(0,100):[],
    });
    if (!matched || matched.tipo!=="anonimo" || matched.id!==anonId) {
      return NextResponse.json({available:false,error:"target_offline_or_restricted"}, {status:409,headers:{"Cache-Control":"no-store"}});
    }
    const targetUid=await lookupAnonMatchAliasBinding(anonId);
    if (!targetUid || targetUid===caller.uid) {
      return NextResponse.json({available:false,error:"invalid_target"}, {status:409,headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json({available:true}, {headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const status=Number((error as {status?:number})?.status||500);
    return NextResponse.json({available:false,error:status===500?"internal_error":"unauthorized"}, {status,headers:{"Cache-Control":"no-store"}});
  }
}