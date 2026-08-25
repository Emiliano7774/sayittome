/**
 * Server-only moderation tag writes for usuarios/{uid}.
 * Call only AFTER verifyAdminIdToken. Never trusts body.adminEmail as authority.
 *
 * Productive writer = Firestore REST with the verified admin Bearer ID token.
 * Rules require isAdmin() for moderationTag* (usuarios excluded from catch-all).
 * Never write usuarios with API-key-only unauthenticated REST.
 */
import "server-only";

export type UsuarioModerationTagAction = "tag_roleplay" | "clear_moderation_tag";

export type UsuarioModerationTagAdminErrorCode =
  | "invalid_uid"
  | "user_not_found"
  | "write_failed"
  | "admin_writer_unavailable"
  | "missing_id_token";

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

/** Sentinel: patch omits undefined from body while keeping updateMask. */
export const REST_DELETE_FIELD = undefined;

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

/**
 * Productive Hosting-safe deps: public read + Bearer-authenticated patch.
 * idToken must be the same verified admin token from verifyAdminIdToken.
 */
export async function createAuthedRestUsuarioModerationTagDeps(
  idToken: string,
): Promise<UsuarioModerationTagAdminDeps> {
  const token = String(idToken || "").trim();
  if (!token) {
    throw new UsuarioModerationTagAdminError("missing_id_token", 401);
  }
  const { getFirestoreDoc, patchFirestoreDocAuthed } = await import("@/lib/firestore/rest");
  return {
    getUsuarioRef: (uid: string) => ({
      get: async () => {
        const doc = await getFirestoreDoc("usuarios", uid);
        return { exists: Boolean(doc) };
      },
      update: async (patch: Record<string, unknown>) => {
        await patchFirestoreDocAuthed(token, "usuarios", uid, patch);
      },
    }),
    serverTimestamp: () => new Date().toISOString(),
    deleteField: () => REST_DELETE_FIELD,
  };
}

async function resolveDeps(input: {
  deps?: UsuarioModerationTagAdminDeps;
  idToken?: string;
}): Promise<UsuarioModerationTagAdminDeps> {
  if (input.deps) return input.deps;
  const token = String(input.idToken || "").trim();
  if (!token) {
    throw new UsuarioModerationTagAdminError("missing_id_token", 401);
  }
  try {
    return await createAuthedRestUsuarioModerationTagDeps(token);
  } catch (error) {
    if (error instanceof UsuarioModerationTagAdminError) throw error;
    throw new UsuarioModerationTagAdminError("admin_writer_unavailable", 503);
  }
}

/**
 * Idempotent set/clear of moderationTag* on usuarios/{uid}.
 * Authority = verified admin email + Bearer token for rules isAdmin().
 */
export async function applyUsuarioModerationTagAdmin(input: {
  uid: unknown;
  /** Verified admin email from ID token — never from request body. */
  adminEmail: string;
  /** Verified Bearer ID token — required for productive authed REST writer. */
  idToken?: string;
  action: UsuarioModerationTagAction;
  note?: unknown;
  deps?: UsuarioModerationTagAdminDeps;
}): Promise<{ ok: true; uid: string; action: UsuarioModerationTagAction }> {
  const uid = assertExactUsuarioUid(input.uid);
  const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
  if (!adminEmail) {
    throw new UsuarioModerationTagAdminError("write_failed", 500);
  }

  const deps = await resolveDeps({ deps: input.deps, idToken: input.idToken });
  const ref = deps.getUsuarioRef(uid);

  let snap: { exists: boolean };
  try {
    snap = await ref.get();
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 503) {
      throw new UsuarioModerationTagAdminError("admin_writer_unavailable", 503);
    }
    throw new UsuarioModerationTagAdminError("write_failed", 500);
  }
  if (!snap.exists) {
    throw new UsuarioModerationTagAdminError("user_not_found", 404);
  }

  const del = deps.deleteField();
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
          moderationTag: del,
          moderationTagNote: del,
          moderationTagAt: del,
          moderationTagBy: del,
        };

  try {
    await ref.update(patch);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 503) {
      throw new UsuarioModerationTagAdminError("admin_writer_unavailable", 503);
    }
    if (status === 403 || status === 401) {
      throw new UsuarioModerationTagAdminError("write_failed", status === 401 ? 401 : 403);
    }
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
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 503) {
    return { status: 503, body: { ok: false, error: "admin_writer_unavailable" } };
  }
  return { status: 500, body: { ok: false, error: "write_failed" } };
}

/**
 * Auth gate for harness/route: verified admin email is the only authority.
 * Never reads adminEmail from the request body.
 */
export async function runAuthenticatedUsuarioModerationTagAction(input: {
  verifiedAdmin: { email: string } | null;
  idToken?: string;
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
      idToken: input.idToken,
      action: input.action,
      note: input.note,
      deps: input.deps,
    });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return usuarioModerationTagErrorResponse(error);
  }
}
