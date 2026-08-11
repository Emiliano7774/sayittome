import {
  reconcilePendingBeforeRegister,
  shouldClearPendingUnregister,
  shouldFlushPendingUnregister,
} from "@/lib/chat/fcmInstallation";

const installOpLocks = new Map<string, Promise<unknown>>();

export type FcmUpsertResult =
  | { ok: true }
  | { ok: false; reason: "stale" | "cancelled" | "callable" | "invalid_proof" };

export type PendingUnregisterRow = {
  uid: string;
  token: string;
  installationId?: string;
  proof?: string;
};

export type FcmPipelineDeps = {
  liveUid: () => string;
  readPending: () => PendingUnregisterRow | null;
  clearPending: () => void;
  flushCall: (input: {
    token: string;
    installationId: string;
    proof: string;
  }) => Promise<void>;
  registerCall: (input: { uid: string; token: string; installationId: string }) => Promise<void>;
};

export async function withInstallationLock<T>(
  installationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = String(installationId || "").trim() || "unknown";
  const prev = installOpLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  installOpLocks.set(
    key,
    prev.then(
      () => gate,
      () => gate,
    ),
  );
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

export function shouldClearPendingAfterSuccess(input: {
  pendingInstallationId?: string;
  currentInstallationId?: string;
}) {
  return shouldClearPendingUnregister(input);
}

export async function flushPendingUnlocked(
  deps: FcmPipelineDeps,
  input: {
    currentUid: string;
    installationId: string;
    currentToken?: string;
    proof: string;
  },
): Promise<boolean> {
  const pending = deps.readPending();
  if (!pending?.token) return false;
  if (
    !shouldFlushPendingUnregister({
      pendingUid: pending.uid,
      currentUid: input.currentUid,
      pendingToken: pending.token,
      currentToken: input.currentToken || "",
    })
  ) {
    return false;
  }
  if (deps.liveUid() !== input.currentUid) return false;
  await deps.flushCall({
    token: pending.token,
    installationId: pending.installationId || input.installationId,
    proof: input.proof,
  });
  if (deps.liveUid() !== input.currentUid) return false;
  return true;
}

export async function reconcileThenRegisterUnlocked(
  deps: FcmPipelineDeps,
  input: {
    uid: string;
    token: string;
    installationId: string;
    proof: string;
    currentToken?: string;
  },
): Promise<FcmUpsertResult> {
  if (deps.liveUid() !== input.uid) return { ok: false, reason: "stale" };

  const pending = deps.readPending();
  const action = pending?.token
    ? reconcilePendingBeforeRegister({
        pendingUid: pending.uid,
        pendingToken: pending.token,
        currentUid: input.uid,
        nextToken: input.token,
        pendingInstallationId: pending.installationId,
        currentInstallationId: input.installationId,
      })
    : "none";

  if (action === "flush_then_register") {
    try {
      const flushed = await flushPendingUnlocked(deps, {
        currentUid: input.uid,
        installationId: input.installationId,
        currentToken: input.currentToken,
        proof: pending?.proof || input.proof,
      });
      if (!flushed && deps.readPending()) {
        return { ok: false, reason: "callable" };
      }
    } catch {
      return { ok: false, reason: "callable" };
    }
  }

  if (deps.liveUid() !== input.uid) return { ok: false, reason: "cancelled" };

  try {
    await deps.registerCall({
      uid: input.uid,
      token: input.token,
      installationId: input.installationId,
    });
  } catch {
    return { ok: false, reason: "callable" };
  }

  if (deps.liveUid() !== input.uid) return { ok: false, reason: "stale" };

  if (
    shouldClearPendingAfterSuccess({
      pendingInstallationId: deps.readPending()?.installationId,
      currentInstallationId: input.installationId,
    })
  ) {
    deps.clearPending();
  }
  return { ok: true };
}

export async function runSerializedEnable(
  installationId: string,
  deps: FcmPipelineDeps,
  input: {
    uid: string;
    token: string;
    proof: string;
    currentToken?: string;
  },
): Promise<FcmUpsertResult> {
  return withInstallationLock(installationId, () =>
    reconcileThenRegisterUnlocked(deps, {
      ...input,
      installationId,
    }),
  );
}
