/**
 * Sanitized media-send failure diagnostics (no tokens, mediaUrl, or PII bodies).
 */
export type ChatMediaFailStage =
  | "scan"
  | "upload"
  | "identity"
  | "chat_read"
  | "batch_write"
  | "view_once_commit"
  | "rollback_storage"
  | "rollback_message"
  | "unknown";

export type ChatMediaFailDiag = {
  stage: ChatMediaFailStage;
  op: string;
  path: string;
  code: string;
};

const SAFE_CODE = /^[a-z0-9_./-]{0,80}$/i;

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
    super(`${input.stage}:${input.op}:${code}`);
    this.name = "ChatMediaSendError";
    this.stage = input.stage;
    this.op = String(input.op || "").slice(0, 64);
    this.path = String(input.path || "").slice(0, 120);
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
  // Keep firebase-style codes; strip free text otherwise.
  const m = text.match(/([a-z]+\/[a-z0-9_-]+)/i);
  return m?.[1] || text.replace(/[^a-z0-9_./-]+/gi, "_").slice(0, 80);
}

export function classifyChatMediaSendFailure(error: unknown): ChatMediaFailDiag {
  if (error instanceof ChatMediaSendError) {
    return {
      stage: error.stage,
      op: error.op,
      path: error.path,
      code: error.code,
    };
  }

  const name = String((error as { name?: string })?.name || "");
  const code = sanitizeFailCode(
    (error as { code?: string })?.code || (error as Error)?.message || "error",
  );
  const message = String((error as Error)?.message || "").toLowerCase();

  if (name === "PersistIdentityError" || message.includes("identity")) {
    return { stage: "identity", op: "resolvePersistMessageAuthor", path: "chats/{chatId}", code };
  }
  if (code.includes("storage") || message.includes("storage")) {
    return { stage: "upload", op: "uploadBytesResumable", path: "chats/{chatId}/{object}", code };
  }
  if (code.includes("functions/") || message.includes("commitviewoncesecret")) {
    return {
      stage: "view_once_commit",
      op: "commitViewOnceSecret",
      path: "callable:commitViewOnceSecret",
      code,
    };
  }
  if (code.includes("permission-denied") || message.includes("permission")) {
    return { stage: "batch_write", op: "writeBatch.commit", path: "chats/{chatId}+mensajes", code };
  }
  return { stage: "unknown", op: "sendMedia", path: "chat", code };
}

/** User-visible one-liner; never includes URLs/tokens/PII. */
export function formatChatMediaFailAlert(base: string, error: unknown) {
  const diag = classifyChatMediaSendFailure(error);
  return `${base}\n[${diag.stage}/${diag.op}/${diag.code}]`;
}
