export function asPushId(value: unknown) {
  return String(value || "").trim();
}

export function isOpaqueAnonSessionId(value: string) {
  return /^anon_[a-z0-9]+_[a-z0-9]+$/i.test(value);
}

export function looksLikeFirebaseAuthUid(value: string) {
  return /^[A-Za-z0-9]{20,36}$/.test(value) && !value.startsWith("anon_");
}

export function formatAnonSessionLabel(sessionId: string) {
  const clean = asPushId(sessionId);
  if (!clean || looksLikeFirebaseAuthUid(clean) || !clean.startsWith("anon_")) {
    return "Anon";
  }
  return `Anon-${clean.slice(5, 15)}`;
}

export function resolvePushTitle(input: {
  senderRole?: string;
  senderKind?: string;
  from?: string;
  fromUid?: string;
  senderAuthUid?: string;
}) {
  const role = asPushId(input.senderRole || input.senderKind).toLowerCase();
  const from = asPushId(input.from);
  const fromUid = asPushId(input.fromUid);
  if (role === "anon" || from.startsWith("anon_") || fromUid.startsWith("anon_")) {
    const session =
      from.startsWith("anon_") ? from : fromUid.startsWith("anon_") ? fromUid : "";
    return formatAnonSessionLabel(session);
  }
  return from || "SayItToMe";
}

export function excludeSelfPushUids(
  recipients: string[],
  excluded: Array<string | undefined>,
) {
  const ban = new Set(excluded.map((uid) => asPushId(uid)).filter(Boolean));
  return recipients.filter((uid) => {
    const clean = asPushId(uid);
    return Boolean(clean) && !ban.has(clean);
  });
}
