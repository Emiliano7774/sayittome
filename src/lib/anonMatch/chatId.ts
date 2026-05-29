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

export function buildAnonMatchRequestId(solicitanteKey: string, anonId: string) {
  return `req_${safePart(solicitanteKey)}_${safePart(anonId)}_${Date.now().toString(36)}`;
}
