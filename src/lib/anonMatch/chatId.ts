function safePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

export function buildAnonDirectChatId(solicitanteUid: string, anonId: string) {
  return `pad_${safePart(solicitanteUid)}_${safePart(anonId)}`;
}

export function buildAnonMatchRequestId(solicitanteUid: string, anonId: string) {
  return `req_${safePart(solicitanteUid)}_${safePart(anonId)}_${Date.now().toString(36)}`;
}
