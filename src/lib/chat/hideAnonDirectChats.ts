import { auth } from "@/lib/firebase";

const CHUNK = 25;

/** Persistently hide direct-anonymous inbox rows for just the requesting Firebase UID. */
export async function hideAnonDirectInboxChats(chatIds: string[]) {
  const ids = [...new Set(chatIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) return;
  const user = auth.currentUser;
  if (!user) throw new Error("unauthorized");
  const token = await user.getIdToken();

  for (let index = 0; index < ids.length; index += CHUNK) {
    const slice = ids.slice(index, index + CHUNK);
    const response = await fetch("/api/chat/hide-anon-direct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatIds: slice }),
      cache: "no-store",
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(25000)
          : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      hidden?: string[];
      denied?: string[];
      error?: string;
    };
    if (!response.ok || !result.ok || (result.hidden || []).length !== slice.length) {
      throw new Error(String(result.error || `hide_${response.status}`));
    }
  }
}
