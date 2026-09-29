export type AnonMatchCallerKind = "registered_profile" | "anonymous_firebase" | "unauthenticated";

export type FirebaseCallerSnapshot = {
  uid: string;
  isAnonymous?: boolean;
} | null;

/** Registered profile ≠ Firebase anonymous (AuthContext sets firebaseUser for both). */
export function resolveAnonMatchCallerKind(
  firebaseUser: FirebaseCallerSnapshot,
): AnonMatchCallerKind {
  const uid = String(firebaseUser?.uid || "").trim();
  if (!uid) return "unauthenticated";
  if (firebaseUser?.isAnonymous) return "anonymous_firebase";
  return "registered_profile";
}

export function isRegisteredProfileCaller(firebaseUser: FirebaseCallerSnapshot): boolean {
  return resolveAnonMatchCallerKind(firebaseUser) === "registered_profile";
}

export function registeredProfileUid(firebaseUser: FirebaseCallerSnapshot): string {
  return isRegisteredProfileCaller(firebaseUser) ? String(firebaseUser?.uid || "").trim() : "";
}

/** Caller classification from a live Firebase user (not a stale React render closure). */
export type AnonMatchCallerSnapshot = {
  callerKind: AnonMatchCallerKind;
  registeredUid: string;
  isRegisteredProfile: boolean;
};

export function resolveAnonMatchCallerSnapshot(
  firebaseUser: FirebaseCallerSnapshot,
): AnonMatchCallerSnapshot {
  const callerKind = resolveAnonMatchCallerKind(firebaseUser);
  return {
    callerKind,
    registeredUid: registeredProfileUid(firebaseUser),
    isRegisteredProfile: callerKind === "registered_profile",
  };
}

export function buildAnonMatchRequestBody(input: {
  callerKind: AnonMatchCallerKind;
  registeredUid: string;
  serverAnonAlias: string;
  localAnonId?: string;
}): Record<string, unknown> {
  if (input.callerKind === "registered_profile") {
    const localAnonId = String(input.localAnonId || "").trim();
    return {
      localAnonId,
      excludeAnonIds: localAnonId ? [localAnonId] : [],
      excludeUids: [input.registeredUid],
    };
  }
  if (input.callerKind === "anonymous_firebase") {
    const alias = String(input.serverAnonAlias || "").trim();
    if (!alias) throw Object.assign(new Error("missing_server_anon_alias"), { status: 400 });
    return {
      solicitanteAnonId: alias,
      localAnonId: alias,
      excludeAnonIds: [alias],
    };
  }
  throw Object.assign(new Error("unauthenticated"), { status: 401 });
}

export function resolveAcceptedChatRole(callerKind: AnonMatchCallerKind): "perfil" | "anonimo" {
  return callerKind === "registered_profile" ? "perfil" : "anonimo";
}

export function buildAnonMatchCloseBody(input: {
  chatId: string;
  role: "perfil" | "anonimo";
  registeredUid: string;
  serverAnonAlias: string;
}): { chatId: string; closedBy: string } {
  return {
    chatId: input.chatId,
    closedBy:
      input.role === "perfil"
        ? String(input.registeredUid || "").trim()
        : String(input.serverAnonAlias || "").trim(),
  };
}

export function buildAnonMatchRespondBody(input: {
  solicitudId: string;
  accept: boolean;
  receiverRole: "perfil" | "anonimo";
  registeredUid: string;
  serverAnonAlias: string;
}): Record<string, unknown> {
  if (input.receiverRole === "perfil") {
    const uid = String(input.registeredUid || "").trim();
    if (!uid) throw Object.assign(new Error("missing_registered_responder"), { status: 403 });
    return { solicitudId: input.solicitudId, accept: input.accept };
  }
  const anonId = String(input.serverAnonAlias || "").trim();
  if (!anonId) throw Object.assign(new Error("missing_server_anon_alias"), { status: 400 });
  return { solicitudId: input.solicitudId, accept: input.accept, anonId };
}

export type IncomingListenerTargets = {
  profileDestinatarioUid?: string;
  anonDestinatarioId?: string;
};

export function resolveIncomingListenerTargets(input: {
  callerKind: AnonMatchCallerKind;
  registeredUid: string;
  serverAnonAlias: string;
}): IncomingListenerTargets {
  if (input.callerKind === "registered_profile") {
    return { profileDestinatarioUid: input.registeredUid };
  }
  if (input.callerKind === "anonymous_firebase") {
    return { anonDestinatarioId: input.serverAnonAlias };
  }
  return {};
}

export type ActiveChatDiscoveryTargets = {
  mode: "profile" | "anonymous" | "none";
  registeredUid?: string;
  anonId?: string;
};

export function resolveActiveChatDiscoveryTargets(input: {
  callerKind: AnonMatchCallerKind;
  registeredUid: string;
  serverAnonAlias: string;
}): ActiveChatDiscoveryTargets {
  if (input.callerKind === "registered_profile") {
    return { mode: "profile", registeredUid: input.registeredUid };
  }
  if (input.callerKind === "anonymous_firebase" && input.serverAnonAlias) {
    return { mode: "anonymous", anonId: input.serverAnonAlias };
  }
  return { mode: "none" };
}
