/**
 * Bomb / viewOnce capability for anon-direct (chats_anonimos).
 *
 * Backend membership now binds request.auth.uid to solicitanteAuthUid /
 * destinatarioAuthUid on estado==="activo" (see functions isChatMember /
 * isAnonMatchBoundMessageAuthor). Collection roots + chats/ Storage prefix
 * remain OK. Flip to FAIL only if those server checks regress.
 */

export type AnonDirectViewOnceCapability = {
  status: "PASS";
  feature: "bombitas_viewOnce";
  reason: "membership_auth_uid_active_session";
  detail: string;
  collectionRootsOk: true;
  storageChatsPrefixOk: true;
  mayShowWorkingBombUi: true;
  maySendViewOnce: true;
  mayClaimViewOnce: true;
};

export function getAnonDirectViewOnceCapability(): AnonDirectViewOnceCapability {
  return {
    status: "PASS",
    feature: "bombitas_viewOnce",
    reason: "membership_auth_uid_active_session",
    detail:
      "commitViewOnceSecret/claimViewOnceMedia accept anon-match members when " +
      "auth.uid equals solicitanteAuthUid|destinatarioAuthUid and estado===activo; " +
      "author binds via senderId↔anon_* alias. Closed/expired/foreign uids denied.",
    collectionRootsOk: true,
    storageChatsPrefixOk: true,
    mayShowWorkingBombUi: true,
    maySendViewOnce: true,
    mayClaimViewOnce: true,
  };
}

export function assertAnonDirectViewOnceSendAllowed(viewOnce: boolean) {
  if (!viewOnce) return;
  const cap = getAnonDirectViewOnceCapability();
  if (!cap.maySendViewOnce) {
    throw Object.assign(new Error(cap.reason), {
      code: "anon_direct_viewonce_blocked",
      capability: cap,
    });
  }
}
