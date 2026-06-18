export async function postAdminAction(
  adminEmail: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch("/api/admin/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-email": adminEmail,
    },
    body: JSON.stringify({ ...payload, adminEmail }),
  });

  return res.json();
}
