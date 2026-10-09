import type { AnonDirectInboxShell } from "@/lib/anonMatch/anonDirectInboxShell";

const STORAGE_KEY = "sayittome_anon_direct_inbox_shells_v1";

type StoredShell = {
  chatId: string;
  role: "perfil" | "anonimo";
};

/** Session-scoped known shells so dismiss does not orphan the GENERAL inbox row. */
export function loadAnonDirectInboxMemory(): StoredShell[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredShell[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        chatId: String(row?.chatId || "").trim(),
        role: row?.role === "perfil" ? ("perfil" as const) : ("anonimo" as const),
      }))
      .filter((row) => row.chatId);
  } catch {
    return [];
  }
}

export function rememberAnonDirectInboxShell(
  chatId: string,
  role: "perfil" | "anonimo",
) {
  if (typeof window === "undefined") return;
  const id = String(chatId || "").trim();
  if (!id) return;
  try {
    const prev = loadAnonDirectInboxMemory().filter((row) => row.chatId !== id);
    prev.unshift({ chatId: id, role });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(0, 8)));
  } catch {
    // Ignore quota.
  }
}

export function forgetAnonDirectInboxShell(chatId: string) {
  if (typeof window === "undefined") return;
  const id = String(chatId || "").trim();
  if (!id) return;
  try {
    const next = loadAnonDirectInboxMemory().filter((row) => row.chatId !== id);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore.
  }
}

export function shellsFromMemoryHint(
  shells: AnonDirectInboxShell[],
): StoredShell[] {
  return shells
    .filter((s) => s.estado === "activo")
    .map((s) => ({ chatId: s.chatId, role: s.role }));
}
