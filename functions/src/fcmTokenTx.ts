import { isValidFcmInstallationId, isValidInstallationProof } from "./fcmInstallation";

export const FCM_RATE_WINDOW_MS = 10_000;
export const FCM_RATE_MAX = 8;

export function isLegacyInstallationProof(value: string) {
  return /^p_[0-9a-f]{8}$/i.test(String(value || "").trim());
}

export function decideInstallationProofUpdate(input: {
  storedProof: string;
  incomingProof: string;
  prevUid: string;
  uid: string;
}) {
  const stored = String(input.storedProof || "").trim();
  const incoming = String(input.incomingProof || "").trim();
  const prevUid = String(input.prevUid || "").trim();
  const uid = String(input.uid || "").trim();
  if (!incoming || !isValidInstallationProof(incoming)) {
    return { ok: false as const, upgrade: false, error: "invalid_installation_proof" };
  }
  if (!stored || stored === incoming) {
    return { ok: true as const, upgrade: false, error: "" };
  }
  if (isLegacyInstallationProof(stored) && prevUid && prevUid === uid) {
    return { ok: true as const, upgrade: true, error: "" };
  }
  return { ok: false as const, upgrade: false, error: "installation_proof_mismatch" };
}

export type FcmTxSnap = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

export type FcmTxRef = { path: string };

export type FcmTx = {
  get: (ref: FcmTxRef) => Promise<FcmTxSnap>;
  delete: (ref: FcmTxRef) => void;
  set?: (ref: FcmTxRef, data: Record<string, unknown>) => void;
};

export function createReadBeforeWriteGuard() {
  let wrote = false;
  return {
    markWrite() {
      wrote = true;
    },
    assertCanRead() {
      if (wrote) throw new Error("read_after_write");
    },
    get wrote() {
      return wrote;
    },
  };
}

export function assertDurableRateLimit(input: {
  stamps: number[];
  nowMs: number;
  windowMs?: number;
  max?: number;
}) {
  const windowMs = input.windowMs ?? FCM_RATE_WINDOW_MS;
  const max = input.max ?? FCM_RATE_MAX;
  const stamps = (input.stamps || []).filter(
    (ts) => Number.isFinite(ts) && input.nowMs - ts < windowMs,
  );
  if (stamps.length >= max) {
    return { ok: false as const, stamps, error: "rate_limited" };
  }
  return {
    ok: true as const,
    stamps: [...stamps, input.nowMs].slice(-max * 2),
    error: "",
  };
}

export async function registerFcmTokenInTransaction(
  tx: FcmTx,
  input: {
    uid: string;
    tokenId: string;
    installationId: string;
    proof: string;
    nowMs?: number;
    tokenPayload?: Record<string, unknown>;
  },
) {
  const uid = String(input.uid || "").trim();
  const tokenId = String(input.tokenId || "").trim();
  const installationId = String(input.installationId || "").trim();
  const proof = String(input.proof || "").trim();
  if (!uid || !tokenId || !isValidFcmInstallationId(installationId)) {
    return { ok: false as const, error: "invalid_argument" };
  }
  const proofGate = decideInstallationProofUpdate({
    storedProof: "",
    incomingProof: proof,
    prevUid: "",
    uid,
  });
  if (!proofGate.ok) return { ok: false as const, error: proofGate.error };

  const installRef: FcmTxRef = { path: `fcmInstallations/${installationId}` };
  const rateRef: FcmTxRef = { path: `fcmRateLimits/${uid}__${installationId}` };
  const tokenRef: FcmTxRef = { path: `usuarios/${uid}/fcmTokens/${tokenId}` };

  const [installSnap, rateSnap] = await Promise.all([tx.get(installRef), tx.get(rateRef)]);
  const data = installSnap.data() || {};
  const prevUid = String(data.uid || "").trim();
  const prevTokenHash = String(data.tokenHash || "").trim();
  const storedProof = String(data.proofHash || "").trim();
  const decided = decideInstallationProofUpdate({
    storedProof,
    incomingProof: proof,
    prevUid,
    uid,
  });
  if (!decided.ok) return { ok: false as const, error: decided.error };

  const rate = assertDurableRateLimit({
    stamps: Array.isArray(rateSnap.data()?.stamps) ? (rateSnap.data()?.stamps as number[]) : [],
    nowMs: input.nowMs ?? Date.now(),
  });
  if (!rate.ok) return { ok: false as const, error: rate.error };

  if (prevUid && prevUid !== uid && prevTokenHash) {
    tx.delete({ path: `usuarios/${prevUid}/fcmTokens/${prevTokenHash}` });
  }
  if (prevUid === uid && prevTokenHash && prevTokenHash !== tokenId) {
    tx.delete({ path: `usuarios/${uid}/fcmTokens/${prevTokenHash}` });
  }
  tx.set?.(tokenRef, {
    tokenId,
    installationId,
    uid,
    ...(input.tokenPayload || {}),
  });
  tx.set?.(installRef, {
    uid,
    tokenHash: tokenId,
    installationId,
    proofHash: proof,
  });
  tx.set?.(rateRef, { stamps: rate.stamps });
  return { ok: true as const, error: "", upgradedProof: decided.upgrade, claimedFrom: prevUid };
}

export async function unregisterFcmTokenInTransaction(
  tx: FcmTx,
  input: {
    uid: string;
    tokenId: string;
    installationId?: string;
    proof?: string;
    expectedUid?: string;
    validInstallationId?: boolean;
  },
) {
  const uid = String(input.uid || "").trim();
  const expectedUid = String(input.expectedUid || uid).trim();
  const tokenId = String(input.tokenId || "").trim();
  const installationId = String(input.installationId || "").trim();
  const proof = String(input.proof || "").trim();
  const tokenRef: FcmTxRef = { path: `usuarios/${uid}/fcmTokens/${tokenId}` };
  const installRef: FcmTxRef | null =
    input.validInstallationId !== false && isValidFcmInstallationId(installationId)
      ? { path: `fcmInstallations/${installationId}` }
      : null;

  const tokenSnap = await tx.get(tokenRef);
  const installSnap = installRef ? await tx.get(installRef) : null;

  const data = installSnap?.data() || {};
  const installUid = String(data.uid || "").trim();
  const proofHash = String(data.proofHash || "").trim();
  const tokenHash = String(data.tokenHash || "").trim();

  const ownerOk = !installSnap?.exists || installUid === expectedUid;
  const proofOk =
    !proofHash ||
    proofHash === proof ||
    (isLegacyInstallationProof(proofHash) && installUid === expectedUid && isValidInstallationProof(proof));
  const tokenOk = !tokenHash || tokenHash === tokenId;

  if (!ownerOk || !proofOk || !tokenOk || expectedUid !== uid) {
    return { deletedToken: false, deletedInstall: false, error: "ownership_mismatch" };
  }

  if (tokenSnap.exists) tx.delete(tokenRef);
  if (installRef && installSnap?.exists) tx.delete(installRef);
  return {
    deletedToken: tokenSnap.exists,
    deletedInstall: Boolean(installRef && installSnap?.exists),
    error: "",
  };
}
