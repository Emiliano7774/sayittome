import { auth } from "@/lib/firebase";

async function adminAuthHeaders() {
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : "";
  const headers: Record<string, string> = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const email = user?.email || "";
  if (email) headers["x-admin-email"] = email;
  return headers;
}

export async function fetchAdminJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const headers = await adminAuthHeaders();
  const res = await fetch(path, { headers, cache: "no-store" });
  return (await res.json()) as T;
}

export async function fetchAdminMediaBlob(path: string): Promise<{
  ok: boolean;
  blob?: Blob;
  mediaType?: string;
  source?: string;
  error?: string;
}> {
  const headers = await adminAuthHeaders();
  const res = await fetch(path, { headers, cache: "no-store" });
  if (!res.ok) {
    let error = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      error = String(body.error || error);
    } catch {}
    return { ok: false, error };
  }
  return {
    ok: true,
    blob: await res.blob(),
    mediaType: String(res.headers.get("X-SayItToMe-Media-Type") || ""),
    source: String(res.headers.get("X-SayItToMe-Media-Source") || ""),
  };
}
