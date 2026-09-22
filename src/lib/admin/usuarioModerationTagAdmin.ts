/**
 * Server-only moderation tag writes for usuarios/{uid}.
 * Call only AFTER verifyAdminIdToken. Never trusts body.adminEmail as authority.
 *
 * Productive writer = Admin SDK, only after verified admin allowlist.
 * Rules still deny client/API-key-only writes to moderation fields.
 */
import "server-only";

import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin/isAdmin";

export type UsuarioModerationTagAction =
  | "tag_roleplay"
  | "tag_grooming"
  | "tag_potential_pedophile"
  | "clear_grooming_tag"
  | "clear_potential_pedophile_tag"
  | "clear_moderation_tag"
  | "tag_fake_profile"
  | "clear_fake_profile_tag";

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
const DEFAULT_GROOMING_NOTE = "Perfil marcado por moderación por señales fuertes de grooming.";
const DEFAULT_POTENTIAL_PEDOPHILE_NOTE = "Perfil marcado por moderación por evidencia fuerte de posible conducta pedófila.";
const DEFAULT_FAKE_PROFILE_NOTE = "Perfil falso marcado por moderación.";

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
 * Productive writer after the API has already verified the admin ID token.
 * Admin SDK avoids a second, redundant client-rules authorization hop.
 */
export async function createAdminSdkUsuarioModerationTagDeps(): Promise<UsuarioModerationTagAdminDeps> {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminFirestore } = await import("@/lib/admin/firebaseAdminNative");
  const db = getRepairAdminDb();
  const { FieldValue } = loadFirebaseAdminFirestore();

  return {
    getUsuarioRef: (uid: string) => {
      const ref = db.collection("usuarios").doc(uid);
      return {
        get: async () => {
          const snap = await ref.get();
          return { exists: Boolean(snap.exists) };
        },
        update: async (patch: Record<string, unknown>) => {
          await ref.update(patch);
        },
      };
    },
    serverTimestamp: () => FieldValue.serverTimestamp(),
    deleteField: () => FieldValue.delete(),
  };
}

async function resolveDeps(input: {
  deps?: UsuarioModerationTagAdminDeps;
  idToken?: string;
}): Promise<UsuarioModerationTagAdminDeps> {
  if (input.deps) return input.deps;
  void input.idToken;
  try {
    return await createAdminSdkUsuarioModerationTagDeps();
  } catch (error) {
    if (error instanceof UsuarioModerationTagAdminError) throw error;
    throw new UsuarioModerationTagAdminError("admin_writer_unavailable", 503);
  }
}

/**
 * Idempotent set/clear of moderationTag* and/or independent fakeProfileTag*
 * on usuarios/{uid}. Roleplay and fake marks never replace each other.
 * Authority = verified admin email + Bearer token for rules isAdmin().
 */
export async function applyUsuarioModerationTagAdmin(input: {
  uid: unknown;
  /** Verified admin email from ID token — never from request body. */
  adminEmail: string;
  /** Kept for route/harness compatibility; authority was already verified by the API. */
  idToken?: string;
  action: UsuarioModerationTagAction;
  note?: unknown;
  deps?: UsuarioModerationTagAdminDeps;
}): Promise<{ ok: true; uid: string; action: UsuarioModerationTagAction }> {
  const uid = assertExactUsuarioUid(input.uid);
  const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
  if (!isAdminEmail(adminEmail) || adminEmail !== ADMIN_EMAIL) {
    throw new UsuarioModerationTagAdminError("write_failed", 403);
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
  let patch: Record<string, unknown>;
  switch (input.action) {
    case "tag_roleplay":
      patch = {
        moderationTag: "roleplay",
        moderationTagNote:
          String(input.note || DEFAULT_ROLEPLAY_NOTE).trim() || DEFAULT_ROLEPLAY_NOTE,
        moderationTagAt: deps.serverTimestamp(),
        moderationTagBy: adminEmail,
      };
      break;
    case "tag_grooming":
      patch = {
        groomingTag: true,
        groomingTagNote: String(input.note || DEFAULT_GROOMING_NOTE).trim() || DEFAULT_GROOMING_NOTE,
        groomingTagAt: deps.serverTimestamp(),
        groomingTagBy: adminEmail,
      };
      break;
    case "tag_potential_pedophile":
      patch = {
        potentialPedophileTag: true,
        potentialPedophileTagNote: String(input.note || DEFAULT_POTENTIAL_PEDOPHILE_NOTE).trim() || DEFAULT_POTENTIAL_PEDOPHILE_NOTE,
        potentialPedophileTagAt: deps.serverTimestamp(),
        potentialPedophileTagBy: adminEmail,
      };
      break;
    case "clear_grooming_tag":
      patch = {
        groomingTag: del, groomingTagNote: del, groomingTagAt: del, groomingTagBy: del,
      };
      break;
    case "clear_potential_pedophile_tag":
      patch = {
        potentialPedophileTag: del, potentialPedophileTagNote: del, potentialPedophileTagAt: del, potentialPedophileTagBy: del,
      };
      break;
    case "clear_moderation_tag":
      patch = {
        moderationTag: del,
        moderationTagNote: del,
        moderationTagAt: del,
        moderationTagBy: del,
      };
      break;
    case "tag_fake_profile":
      patch = {
        fakeProfileTag: "fake",
        fakeProfileTagNote:
          String(input.note || DEFAULT_FAKE_PROFILE_NOTE).trim() || DEFAULT_FAKE_PROFILE_NOTE,
        fakeProfileTagAt: deps.serverTimestamp(),
        fakeProfileTagBy: adminEmail,
      };
      break;
    case "clear_fake_profile_tag":
      patch = {
        fakeProfileTag: del,
        fakeProfileTagNote: del,
        fakeProfileTagAt: del,
        fakeProfileTagBy: del,
      };
      break;
    default:
      throw new UsuarioModerationTagAdminError("write_failed", 400);
  }

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
