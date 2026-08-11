/**
 * User-assisted authorship marks for historical inverts that remain ambiguous.
 * No message text, usernames, or full UIDs. Never auto-applies Firestore writes.
 */
const STORAGE_KEY = "sayittome:authorship-corrections:v1";

export type AuthorshipCorrection = {
  messageId: string;
  mine: boolean;
  source: "user";
  at: number;
};

type Store = { marks: Record<string, AuthorshipCorrection> };

function readStore(): Store {
  if (typeof window === "undefined") return { marks: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Store;
    return { marks: parsed.marks && typeof parsed.marks === "object" ? parsed.marks : {} };
  } catch {
    return { marks: {} };
  }
}

function writeStore(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listAuthorshipCorrections(): AuthorshipCorrection[] {
  return Object.values(readStore().marks).sort((a, b) => b.at - a.at);
}

export function getAuthorshipCorrection(messageId: string) {
  return readStore().marks[String(messageId || "").trim()] || null;
}

export function setAuthorshipCorrection(messageId: string, mine: boolean) {
  const id = String(messageId || "").trim();
  if (!id) return;
  const store = readStore();
  store.marks[id] = { messageId: id, mine, source: "user", at: Date.now() };
  writeStore(store);
}

export function clearAuthorshipCorrection(messageId: string) {
  const store = readStore();
  delete store.marks[String(messageId || "").trim()];
  writeStore(store);
}

export function clearAuthorshipCorrections() {
  writeStore({ marks: {} });
}

export function applyAuthorshipCorrections<T extends { id?: string; mine?: boolean }>(
  messages: T[],
): T[] {
  const store = readStore();
  if (!Object.keys(store.marks).length) return messages;
  let changed = false;
  const next = messages.map((message) => {
    const id = String(message.id || "").trim();
    const mark = store.marks[id];
    if (!mark || mark.mine === message.mine) return message;
    changed = true;
    return { ...message, mine: mark.mine };
  });
  return changed ? next : messages;
}

/** Exportable capture: message ids only, no PII. */
export function exportAuthorshipCorrections() {
  return {
    version: 1,
    kind: "authorship-corrections",
    marks: listAuthorshipCorrections().map((mark) => ({
      messageId: mark.messageId,
      mine: mark.mine,
      source: mark.source,
      at: mark.at,
    })),
  };
}
