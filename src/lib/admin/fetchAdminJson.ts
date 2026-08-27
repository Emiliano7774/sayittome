import { auth } from "@/lib/firebase";

export async function fetchAdminJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : "";
  const headers: Record<string, string> = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const email = user?.email || "";
  if (email) headers["x-admin-email"] = email;

  const res = await fetch(path, { headers, cache: "no-store" });
  return (await res.json()) as T;
}
