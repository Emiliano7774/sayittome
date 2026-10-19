import { runCollectionQueryAllByDocumentId } from "@/lib/firestore/rest";

// Both admin overview and registrations read the same full user collection.
// Keep a short, in-process authoritative snapshot so overlapping refreshes
// do not bill a separate read of every user document on each endpoint.
const ADMIN_USERS_CACHE_MS = 5 * 60_000;

export type AdminUserSnapshot = Record<string, unknown>;
type AdminDocSnapshot = {
  id: string;
  data: () => Record<string, unknown>;
  createTime?: { toDate?: () => Date };
};

let cached: { users: AdminUserSnapshot[]; loadedAt: number } | null = null;
let inFlight: Promise<AdminUserSnapshot[]> | null = null;

async function loadAdminUsers(): Promise<AdminUserSnapshot[]> {
  try {
    const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
    const snap = await getRepairAdminDb().collection("usuarios").get();
    return snap.docs.map((doc: AdminDocSnapshot) => ({
      ...doc.data(),
      id: doc.id,
      _firestoreCreateTime: doc.createTime?.toDate?.()?.toISOString?.() || "",
    }));
  } catch (error) {
    if ((error as Error)?.message !== "admin_sdk_unavailable") throw error;
    return runCollectionQueryAllByDocumentId("usuarios");
  }
}

export async function getCachedAdminUsers(): Promise<AdminUserSnapshot[]> {
  if (cached && Date.now() - cached.loadedAt < ADMIN_USERS_CACHE_MS) {
    return cached.users;
  }
  if (inFlight) return inFlight;

  const pending = loadAdminUsers().then((users) => {
    cached = { users, loadedAt: Date.now() };
    return users;
  });
  inFlight = pending;
  try {
    return await pending;
  } finally {
    if (inFlight === pending) inFlight = null;
  }
}
