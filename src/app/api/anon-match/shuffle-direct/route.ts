import { NextResponse } from "next/server";
import { createAnonMatchAdminDoc, getAnonMatchAdminDoc } from "@/lib/anonMatch/anonMatchAdminStore";
import { lookupAnonMatchAliasBinding } from "@/lib/anonMatch/anonMatchAliasAdmin";
import { buildShuffleAnonDirectChatId } from "@/lib/anonMatch/chatId";
import { pickAvailableMatchTarget } from "@/lib/anonMatch/matchPool";
import { assertAnonMatchAliasForCaller, verifyAnonMatchCaller } from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";

/** Profile-style anonymous DM from an actual Shuffle card; NOT random matching. */
export async function POST(req: Request) {
  try {
    const caller = await verifyAnonMatchCaller(req);
    if (!caller.isAnonymous) return NextResponse.json({ok:false,error:"anon_caller_required"},{status:403});
    const body = await req.json().catch(() => ({}));
    const ownAlias = await assertAnonMatchAliasForCaller(caller, body.solicitanteAnonId);
    const targetAlias = String(body.targetAnonId || "").trim();
    if (!/^anon_[a-z0-9_]{6,80}$/i.test(targetAlias) || ownAlias === targetAlias) {
      return NextResponse.json({ok:false,error:"invalid_target_anon"},{status:400});
    }

    const picked = await pickAvailableMatchTarget({
      preferredAnonId: targetAlias,
      allowExistingChatsForDirectOpen: true,
      excludeAnonIds: [ownAlias],
      viewerPais: String(body.pais || "").slice(0,100),
      viewerProvincia: String(body.provincia || "").slice(0,100),
      verPaises: Array.isArray(body.verPaises) ? body.verPaises.slice(0,100) : [],
      verProvincias: Array.isArray(body.verProvincias) ? body.verProvincias.slice(0,100) : [],
    });
    if (!picked || picked.tipo !== "anonimo" || picked.id !== targetAlias) {
      return NextResponse.json({ok:false,error:"target_offline_or_restricted"},{status:409});
    }
    const targetUid = await lookupAnonMatchAliasBinding(targetAlias);
    if (!targetUid || caller.uid === targetUid) return NextResponse.json({ok:false,error:"invalid_binding"},{status:403});

    const chatId = buildShuffleAnonDirectChatId(ownAlias, targetAlias);
    const created = await createAnonMatchAdminDoc("chats_anonimos",chatId,{
      chatId,source:"shuffle_direct",tipo:"anon_con_anonimo",
      solicitanteUid:"",solicitanteAnonId:ownAlias,solicitanteAuthUid:caller.uid,
      destinatarioUid:"",anonId:targetAlias,destinatarioAuthUid:targetUid,
      estado:"activo",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),ultimoMensaje:"",
    });
    if (!created.created) {
      const existing = await getAnonMatchAdminDoc("chats_anonimos",chatId);
      const actual = [caller.uid,targetUid].sort().join("|");
      const stored = [String(existing?.solicitanteAuthUid || ""),String(existing?.destinatarioAuthUid || "")].sort().join("|");
      if (!existing || existing.estado !== "activo" || existing.source !== "shuffle_direct" || actual !== stored) {
        return NextResponse.json({ok:false,error:"chat_closed_or_forbidden"},{status:409});
      }
    }
    return NextResponse.json({ok:true,chatId,existing:!created.created});
  } catch (e: unknown) {
    const status = Number((e as {status?:number})?.status || 500);
    return NextResponse.json({ok:false,error:status >= 500 ? "internal_error" : String((e as Error)?.message || "unauthorized")},{status});
  }
}
