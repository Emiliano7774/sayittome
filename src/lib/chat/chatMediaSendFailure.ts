/**
 * Sanitized media-send failure diagnostics (no tokens, mediaUrl, or PII bodies).
 * Stages: scan | upload | persist | secret | cleanup
 * Paths must be logical placeholders only — never real chatId/object ids.
 */
export type ChatMediaFailStage =
  | "scan"
  | "upload"
  | "persist"
  | "secret"
  | "cleanup"
  | "unknown";

export type ChatMediaFailDiag = {
  stage: ChatMediaFailStage;
  op: string;
  path: string;
  code: string;
};

const SAFE_CODE = /^[a-z0-9_./-]{0,80}$/i;
const SAFE_PATH_TOKEN = /^[a-z0-9_{}:./+-]+$/i;

/** Rejects real IDs; keeps chats/{chatId}/… style logical paths. */
export function sanitizeFailPath(raw: unknown): string {
  const text = String(raw || "")
    .replace(/https?:\/\/\S+/gi, "")
    .trim()
    .slice(0, 120);
  if (!text) return "chat";
  // Real-looking segments: Firebase-ish ids, canary_*, anon_*__*
  if (
    /canary_/i.test(text) ||
    /anon_[a-z0-9]+__/i.test(text) ||
    /chats\/(?!\{)[A-Za-z0-9_-]{8,}\b/.test(text) ||
    /\$\{(?:chatId|canonicalChatId|messageId|clientId)\}/.test(text)
  ) {
    return "chats/{chatId}";
  }
  if (!SAFE_PATH_TOKEN.test(text)) {
    return text.replace(/[^a-z0-9_{}:./+-]+/gi, "_").slice(0, 120) || "chat";
  }
  return text;
}

export class ChatMediaSendError extends Error {
  stage: ChatMediaFailStage;
  op: string;
  path: string;
  code: string;

  constructor(input: ChatMediaFailDiag, cause?: unknown) {
    const code = sanitizeFailCode(
      input.code ||
        String((cause as { code?: string })?.code || "") ||
        String((cause as Error)?.message || "error"),
    );
    const path = sanitizeFailPath(input.path);
    super(`${input.stage}:${input.op}:${code}`);
    this.name = "ChatMediaSendError";
    this.stage = input.stage;
    this.op = String(input.op || "").slice(0, 64);
    this.path = path;
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function sanitizeFailCode(raw: unknown) {
  const text = String(raw || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/Bearer\s+\S+/gi, "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "")
    .trim()
    .slice(0, 80);
  if (!text) return "error";
  if (SAFE_CODE.test(text)) return text;
  const m = text.match(/([a-z]+\/[a-z0-9_-]+)/i);
  return m?.[1] || text.replace(/[^a-z0-9_./-]+/gi, "_").slice(0, 80);
}

export function classifyChatMediaSendFailure(error: unknown): ChatMediaFailDiag {
  if (error instanceof ChatMediaSendError) {
    return {
      stage: error.stage,
      op: error.op,
      path: sanitizeFailPath(error.path),
      code: error.code,
    };
  }

  const name = String((error as { name?: string })?.name || "");
  const code = sanitizeFailCode(
    (error as { code?: string })?.code || (error as Error)?.message || "error",
  );
  const message = String((error as Error)?.message || "").toLowerCase();

  if (name === "PersistIdentityError" || message.includes("identity")) {
    return { stage: "persist", op: "resolvePersistMessageAuthor", path: "chats/{chatId}", code };
  }
  if (
    code.includes("storage") ||
    message.includes("storage") ||
    code.startsWith("auth/") ||
    code === "anon_auth_disabled" ||
    message.includes("admin-restricted-operation") ||
    message.includes("admin_only_operation")
  ) {
    return {
      stage: "upload",
      op: code.startsWith("auth/") || code === "anon_auth_disabled"
        ? "ensureStorageAuth"
        : "uploadBytesResumable",
      path: "chats/{chatId}/{object}",
      code,
    };
  }
  if (code.includes("functions/") || message.includes("commitviewoncesecret")) {
    return {
      stage: "secret",
      op: "commitViewOnceSecret",
      path: "callable:commitViewOnceSecret",
      code,
    };
  }
  if (code.includes("permission-denied") || message.includes("permission")) {
    return { stage: "persist", op: "writeBatch.commit", path: "chats/{chatId}+mensajes", code };
  }
  return { stage: "unknown", op: "sendMedia", path: "chat", code };
}

/** User-visible one-liner; never includes URLs/tokens/PII or path ids. */
export function formatChatMediaFailAlert(base: string, error: unknown) {
  const diag = classifyChatMediaSendFailure(error);
  return `${base}\n[${diag.stage}/${diag.op}/${diag.code}]`;
}
