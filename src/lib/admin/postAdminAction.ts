import { auth } from "@/lib/firebase";

export async function postAdminAction(
  adminEmail: string,
  payload: Record<string, unknown>,
) {
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-admin-email": adminEmail,
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const res = await fetch("/api/admin/action", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, adminEmail }),
  });

  return res.json();
}
