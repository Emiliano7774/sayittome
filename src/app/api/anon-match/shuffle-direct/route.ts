import { NextResponse } from "next/server";
import { createAnonMatchAdminDoc, getAnonMatchAdminDoc } from "@/lib/anonMatch/anonMatchAdminStore";
import { getRepairAdminDb } from "@/lib/chat/historicalAuthorshipRepairAdmin";
import { lookupAnonMatchAliasBinding } from "@/lib/anonMatch/anonMatchAliasAdmin";
import { buildShuffleAnonDirectChatId } from "@/lib/anonMatch/chatId";
import { pickAvailableMatchTarget } from "@/lib/anonMatch/matchPool";
import { assertAnonMatchAliasForCaller, verifyAnonMatchCaller } from "@/lib/anonMatch/verifyAnonMatchCaller";

export const dynamic = "force-dynamic";

type DirectChatTransaction = {
  get: (ref: unknown) => Promise<{ data: () => Record<string, unknown> | undefined }>;
  update: (ref: unknown, fields: Record<string, unknown>) => void;
};

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

    // Direct card clicks need the same viewer geography as discovery.
    // Anonymous clients normally send only their discovery filters, not pais;
    // use the authenticated caller's own presence instead of an empty country.
    const ownPresence = await getAnonMatchAdminDoc("anonimos_activos", ownAlias);
    const verifiedOwnPresence = String(ownPresence?.authUid || "") === caller.uid ? ownPresence : null;
    const viewerPais = String(verifiedOwnPresence?.pais ||
      req.headers.get("cf-ipcountry") || req.headers.get("x-country-code") || body.pais || "").slice(0,100);
    const viewerProvincia = String(verifiedOwnPresence?.provincia || body.provincia || "").slice(0,100);

    const picked = await pickAvailableMatchTarget({
      preferredAnonId: targetAlias,
      allowExistingChatsForDirectOpen: true,
      excludeAnonIds: [ownAlias],
      viewerPais,
      viewerProvincia,
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
      chatId,source:"shuffle_direct",adminReviewBucket:"direct",tipo:"anon_con_anonimo",
      solicitanteUid:"",solicitanteAnonId:ownAlias,solicitanteAuthUid:caller.uid,
      destinatarioUid:"",anonId:targetAlias,destinatarioAuthUid:targetUid,
      estado:"activo",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),ultimoMensaje:"",
    });
    if (!created.created) {
      const db = getRepairAdminDb();
      const ref = db.collection("chats_anonimos").doc(chatId);
      const canOpen = await db.runTransaction(async (tx: DirectChatTransaction) => {
        const snap = await tx.get(ref);
        const existing = snap.data();
        const actual = [caller.uid,targetUid].sort().join("|");
        const stored = [String(existing?.solicitanteAuthUid || ""),String(existing?.destinatarioAuthUid || "")].sort().join("|");
        if (!existing || existing.source !== "shuffle_direct" || actual !== stored || existing.denunciadoAt) return false;
        if (existing.estado === "activo") return true;
        // A manually closed direct conversation may be reopened only by an
        // authenticated participant clicking a still-visible Shuffle card.
        // Reported chats are never reopened through this route.
        if (existing.estado !== "cerrado") return false;
        tx.update(ref, { estado: "activo", cerradoPor: "", cerradoAt: "", updatedAt: new Date().toISOString() });
        return true;
      });
      if (!canOpen) return NextResponse.json({ok:false,error:"chat_closed_or_forbidden"},{status:409});
    }
    return NextResponse.json({ok:true,chatId,existing:!created.created});
  } catch (e: unknown) {
    const status = Number((e as {status?:number})?.status || 500);
    return NextResponse.json({ok:false,error:status >= 500 ? "internal_error" : String((e as Error)?.message || "unauthorized")},{status});
  }
}
