/**
 * Privileged usuarios/{uid} writes after catch-all exclusion.
 * Prefer Admin SDK (bypasses rules). Else Bearer-authenticated REST (isOwner/isAdmin).
 * Never falls back to API-key-only unauthenticated REST.
 */
import "server-only";

export async function patchUsuarioPrivileged(
  uid: string,
  fields: Record<string, unknown>,
  opts?: { idToken?: string },
): Promise<void> {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) throw Object.assign(new Error("invalid_uid"), { status: 400 });

  try {
    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    const db = getRepairAdminDb();
    await db.collection("usuarios").doc(cleanUid).update(fields);
    return;
  } catch {
    // Hosting SSR often lacks ADC — fall through to authed REST.
  }

  const token = String(opts?.idToken || "").trim();
  if (!token) {
    throw Object.assign(new Error("usuario_write_unavailable"), { status: 503 });
  }

  const { patchFirestoreDocAuthed } = await import("@/lib/firestore/rest");
  await patchFirestoreDocAuthed(token, "usuarios", cleanUid, fields);
}

export async function deleteUsuarioPrivileged(
  uid: string,
  opts?: { idToken?: string },
): Promise<void> {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) throw Object.assign(new Error("invalid_uid"), { status: 400 });

  try {
    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    const db = getRepairAdminDb();
    await db.collection("usuarios").doc(cleanUid).delete();
    return;
  } catch {
    // fall through
  }

  const token = String(opts?.idToken || "").trim();
  if (!token) {
    throw Object.assign(new Error("usuario_write_unavailable"), { status: 503 });
  }

  const { deleteFirestoreDocAuthed } = await import("@/lib/firestore/rest");
  await deleteFirestoreDocAuthed(token, "usuarios", cleanUid);
}
