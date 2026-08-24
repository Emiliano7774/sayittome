/**
 * Server-only Admin SDK writes for usuarios moderation tags.
 * Call only AFTER verifyAdminIdToken. Never trusts body.adminEmail as authority.
 */
import "server-only";

import type { Firestore } from "@/lib/chat/historicalAuthorshipRepairAdmin";

export type UsuarioModerationTagAction = "tag_roleplay" | "clear_moderation_tag";

export type UsuarioModerationTagAdminErrorCode =
  | "invalid_uid"
  | "user_not_found"
  | "write_failed";

export class UsuarioModerationTagAdminError extends Error {
  readonly status: number;
  readonly code: UsuarioModerationTagAdminErrorCode;

  constructor(code: UsuarioModerationTagAdminErrorCode, status: number, message?: string) {
    super(message || code);
    this.name = "UsuarioModerationTagAdminError";
    this.code = code;
    this.status = status;
  }
}

export type UsuarioDocRef = {
  get: () => Promise<{ exists: boolean }>;
  update: (patch: Record<string, unknown>) => Promise<unknown>;
};

export type UsuarioModerationTagAdminDeps = {
  getUsuarioRef: (uid: string) => UsuarioDocRef;
  serverTimestamp: () => unknown;
  deleteField: () => unknown;
};

const DEFAULT_ROLEPLAY_NOTE = "Perfil de rol marcado por moderación.";

/**
 * Fail-closed uid: exact string (trim must not change it), length 1..128,
 * no slash/backslash, no control characters. No alphabet / minLength inventado.
 */
export function assertExactUsuarioUid(uid: unknown): string {
  if (typeof uid !== "string") {
    throw new UsuarioModerationTagAdminError("invalid_uid", 400);
  }
  if (uid.trim() !== uid) {
    throw new UsuarioModerationTagAdminError("invalid_uid", 400);
  }
  if (uid.length < 1 || uid.length > 128) {
    throw new UsuarioModerationTagAdminError("invalid_uid", 400);
  }
  if (uid.includes("/") || uid.includes("\\") || /[\u0000-\u001F\u007F]/.test(uid)) {
    throw new UsuarioModerationTagAdminError("invalid_uid", 400);
  }
  return uid;
}

async function resolveDeps(
  deps?: UsuarioModerationTagAdminDeps,
): Promise<UsuarioModerationTagAdminDeps> {
  if (deps) return deps;
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminFirestore } = await import("@/lib/admin/firebaseAdminNative");
  const { FieldValue } = loadFirebaseAdminFirestore();
  const db = getRepairAdminDb() as Firestore;
  return {
    getUsuarioRef: (uid: string) => db.collection("usuarios").doc(uid),
    serverTimestamp: () => FieldValue.serverTimestamp(),
    deleteField: () => FieldValue.delete(),
  };
}

/**
 * Idempotent set/clear of moderationTag* on usuarios/{uid} via Admin SDK.
 */
export async function applyUsuarioModerationTagAdmin(input: {
  uid: unknown;
  /** Verified admin email from ID token — never from request body. */
  adminEmail: string;
  action: UsuarioModerationTagAction;
  note?: unknown;
  deps?: UsuarioModerationTagAdminDeps;
}): Promise<{ ok: true; uid: string; action: UsuarioModerationTagAction }> {
  const uid = assertExactUsuarioUid(input.uid);
  const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
  if (!adminEmail) {
    throw new UsuarioModerationTagAdminError("write_failed", 500);
  }

  const deps = await resolveDeps(input.deps);
  const ref = deps.getUsuarioRef(uid);

  let snap: { exists: boolean };
  try {
    snap = await ref.get();
  } catch {
    throw new UsuarioModerationTagAdminError("write_failed", 500);
  }
  if (!snap.exists) {
    throw new UsuarioModerationTagAdminError("user_not_found", 404);
  }

  const patch =
    input.action === "tag_roleplay"
      ? {
          moderationTag: "roleplay",
          moderationTagNote:
            String(input.note || DEFAULT_ROLEPLAY_NOTE).trim() || DEFAULT_ROLEPLAY_NOTE,
          moderationTagAt: deps.serverTimestamp(),
          moderationTagBy: adminEmail,
        }
      : {
          moderationTag: deps.deleteField(),
          moderationTagNote: deps.deleteField(),
          moderationTagAt: deps.deleteField(),
          moderationTagBy: deps.deleteField(),
        };

  try {
    await ref.update(patch);
  } catch {
    throw new UsuarioModerationTagAdminError("write_failed", 500);
  }

  return { ok: true, uid, action: input.action };
}

export function usuarioModerationTagErrorResponse(error: unknown): {
  status: number;
  body: { ok: false; error: string };
} {
  if (error instanceof UsuarioModerationTagAdminError) {
    return { status: error.status, body: { ok: false, error: error.code } };
  }
  return { status: 500, body: { ok: false, error: "write_failed" } };
}

/**
 * Auth gate for harness/route: verified admin email is the only authority.
 * Never reads adminEmail from the request body.
 */
export async function runAuthenticatedUsuarioModerationTagAction(input: {
  verifiedAdmin: { email: string } | null;
  uid: unknown;
  action: UsuarioModerationTagAction;
  note?: unknown;
  /** Ignored — body must never authorize. */
  bodyAdminEmail?: unknown;
  deps?: UsuarioModerationTagAdminDeps;
}): Promise<{ status: number; body: { ok: true } | { ok: false; error: string } }> {
  void input.bodyAdminEmail;
  const email = String(input.verifiedAdmin?.email || "").trim().toLowerCase();
  if (!email) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }
  try {
    await applyUsuarioModerationTagAdmin({
      uid: input.uid,
      adminEmail: email,
      action: input.action,
      note: input.note,
      deps: input.deps,
    });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return usuarioModerationTagErrorResponse(error);
  }
}
