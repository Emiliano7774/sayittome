import { auth } from "@/lib/firebase";
import { removeInboxSnapshotChat } from "@/lib/chat/inboxSnapshot";
import { unregisterSessionChat } from "@/lib/chat/sessionChats";

const CHUNK = 25;

function forgetLocalChat(chatId: string) {
  unregisterSessionChat(chatId);
  removeInboxSnapshotChat(chatId);
}

export async function hardDeleteChats(chatIds: string[]) {
  const unique = [...new Set(chatIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error("login_required");
  }
  const token = await user.getIdToken();

  for (let index = 0; index < unique.length; index += CHUNK) {
    const slice = unique.slice(index, index + CHUNK);
    const res = await fetch("/api/chat/delete-owned", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatIds: slice }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      deleted?: string[];
      error?: string;
    };
    for (const chatId of json.deleted || []) forgetLocalChat(chatId);
    if (!res.ok || !json.ok) {
      throw new Error(String(json.error || `delete_${res.status}`));
    }
  }
}

export async function hardDeleteChat(chatId: string) {
  await hardDeleteChats([chatId]);
}
