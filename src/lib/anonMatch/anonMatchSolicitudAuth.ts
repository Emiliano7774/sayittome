import {
  decideAnonMatchAliasAuthorization,
  isAnonMatchSessionAlias,
} from "@/lib/anonMatch/anonMatchAliasBinding";
import { lookupAnonMatchAliasBinding } from "@/lib/anonMatch/anonMatchAliasAdmin";

/** PATCH/list polling: only the solicitante may read their pending solicitud. */
export async function assertCallerOwnsAnonMatchSolicitud(
  caller: { uid: string; isAnonymous: boolean },
  row: Record<string, unknown>,
) {
  const solicitanteUid = String(row.solicitanteUid || "").trim();
  const solicitanteAnonId = String(row.solicitanteAnonId || "").trim();

  if (caller.isAnonymous) {
    if (!isAnonMatchSessionAlias(solicitanteAnonId)) {
      throw Object.assign(new Error("forbidden_solicitud"), { status: 403 });
    }
    const boundAuthUid = await lookupAnonMatchAliasBinding(solicitanteAnonId);
    const decision = decideAnonMatchAliasAuthorization({
      callerUid: caller.uid,
      callerIsAnonymous: true,
      claimedAnonId: solicitanteAnonId,
      boundAuthUid,
    });
    if (!decision.ok) {
      throw Object.assign(new Error(decision.reason), { status: 403 });
    }
    return;
  }

  if (!solicitanteUid || solicitanteUid !== caller.uid) {
    throw Object.assign(new Error("forbidden_solicitud"), { status: 403 });
  }
}
