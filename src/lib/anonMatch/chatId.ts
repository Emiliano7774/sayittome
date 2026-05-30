function safePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

export function buildAnonDirectChatId(solicitanteUid: string, anonId: string) {
  return `pad_${safePart(solicitanteUid)}_${safePart(anonId)}`;
}

export function buildAnonToAnonDirectChatId(solicitanteAnonId: string, anonId: string) {
  return `aad_${safePart(solicitanteAnonId)}_${safePart(anonId)}`;
}

export function buildProfileToProfileDirectChatId(uidA: string, uidB: string) {
  const parts = [safePart(uidA), safePart(uidB)].sort();
  return `ppd_${parts[0]}_${parts[1]}`;
}

export function buildAnonToProfileDirectChatId(anonId: string, uid: string) {
  return `apd_${safePart(anonId)}_${safePart(uid)}`;
}

export function buildAnonMatchRequestId(solicitanteKey: string, targetKey: string) {
  return `req_${safePart(solicitanteKey)}_${safePart(targetKey)}_${Date.now().toString(36)}`;
}

export function buildDirectChatId(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  destinatarioUid?: string;
  destinatarioAnonId?: string;
}) {
  const solicitanteUid = String(input.solicitanteUid || "").trim();
  const solicitanteAnonId = String(input.solicitanteAnonId || "").trim();
  const destinatarioUid = String(input.destinatarioUid || "").trim();
  const destinatarioAnonId = String(input.destinatarioAnonId || "").trim();

  if (solicitanteUid && destinatarioAnonId && !destinatarioUid) {
    return buildAnonDirectChatId(solicitanteUid, destinatarioAnonId);
  }
  if (solicitanteAnonId && destinatarioAnonId && !solicitanteUid && !destinatarioUid) {
    return buildAnonToAnonDirectChatId(solicitanteAnonId, destinatarioAnonId);
  }
  if (solicitanteUid && destinatarioUid && !solicitanteAnonId && !destinatarioAnonId) {
    return buildProfileToProfileDirectChatId(solicitanteUid, destinatarioUid);
  }
  if (solicitanteAnonId && destinatarioUid && !solicitanteUid) {
    return buildAnonToProfileDirectChatId(solicitanteAnonId, destinatarioUid);
  }

  throw new Error("invalid_direct_chat_participants");
}

export function buildDirectChatSessionId(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  destinatarioUid?: string;
  destinatarioAnonId?: string;
  now?: number;
}) {
  const base = buildDirectChatId(input);
  const stamp = (input.now ?? Date.now()).toString(36);
  return `${base}_${stamp}`;
}

export function resolveTipoSolicitud(input: {
  solicitanteUid?: string;
  solicitanteAnonId?: string;
  destinatarioTipo: "perfil" | "anonimo";
}) {
  const solicitantePerfil = Boolean(input.solicitanteUid);
  const destinatarioPerfil = input.destinatarioTipo === "perfil";

  if (solicitantePerfil && destinatarioPerfil) return "perfil_a_perfil" as const;
  if (solicitantePerfil && !destinatarioPerfil) return "perfil_a_anonimo" as const;
  if (!solicitantePerfil && destinatarioPerfil) return "anon_a_perfil" as const;
  return "anon_a_anonimo" as const;
}

export function resolveDirectChatTipo(tipoSolicitud: string) {
  switch (tipoSolicitud) {
    case "perfil_a_perfil":
      return "perfil_con_perfil" as const;
    case "anon_a_perfil":
      return "anon_con_perfil" as const;
    case "anon_a_anonimo":
      return "anon_con_anonimo" as const;
    default:
      return "perfil_con_anonimo" as const;
  }
}
