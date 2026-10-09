import type { User } from "firebase/auth";

export type RecoveredAnonInboxChat = {
  id: string;
  [key: string]: unknown;
};

export async function fetchRecoveredAnonInboxChats(
  user: User,
): Promise<RecoveredAnonInboxChat[]> {
  const token = await user.getIdToken();
  const response = await fetch(
    "/api/chat/anon-inbox-recovery",
    {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
      credentials: "same-origin",
    },
  );
  if (!response.ok) throw new Error(`anon_inbox_recovery_${response.status}`);
  const payload = (await response.json()) as {
    ok?: boolean;
    chats?: RecoveredAnonInboxChat[];
  };
  if (!payload.ok || !Array.isArray(payload.chats)) {
    throw new Error("anon_inbox_recovery_invalid");
  }
  return payload.chats;
}
