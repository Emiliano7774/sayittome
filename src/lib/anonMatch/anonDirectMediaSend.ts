import {
  ChatMediaSendError,
  classifyChatMediaSendFailure,
} from "@/lib/chat/chatMediaSendFailure";
import {
  anonDirectMediaLastMessageLabel,
  type AnonDirectMediaSource,
  type AnonDirectMediaType,
} from "@/lib/anonMatch/anonDirectMediaLabels";
import { persistAnonDirectMessage } from "@/lib/anonMatch/persistDirectMessage";
import { assertAnonDirectViewOnceSendAllowed } from "@/lib/anonMatch/anonDirectViewOnceCapability";
import {
  deleteChatMessageMediaAtPath,
  isChatMediaAnonAuthDisabled,
  isChatMediaStorageUnauthorized,
  uploadChatMessageMedia,
} from "@/lib/media/upload";
import { scanUploadFile } from "@/lib/moderation/scanMedia";

export type AnonDirectMediaSendInput = {
  chatId: string;
  senderId: string;
  senderAuthUid: string;
  senderTipo: "perfil" | "anonimo";
  blob: Blob;
  type: Exclude<AnonDirectMediaType, "text">;
  source?: AnonDirectMediaSource;
  reply?: string;
  clientId?: string;
  viewOnce?: boolean;
  viewOnceLimit?: number;
  onProgress?: (pct: number) => void;
};

export type AnonDirectMediaSendResult = {
  messageId: string;
  chatId: string;
  mediaUrl: string;
  storagePath: string;
  viewOnce: boolean;
  autoModerationRequiresBlur: boolean;
  moderationRequiresBlur: boolean;
};

/**
 * Upload under Storage chats/{chatId}/… (rules-allowed) then persist to
 * chats_anonimos/.../mensajes. Bombs: upload marked viewOnce, public doc
 * without mediaUrl, secret via commitViewOnceSecret. No Firestore reads.
 */
export async function sendAnonDirectMediaMessage(
  input: AnonDirectMediaSendInput,
): Promise<AnonDirectMediaSendResult> {
  const chatId = String(input.chatId || "").trim();
  const senderId = String(input.senderId || "").trim();
  const type = input.type;
  const clientId = String(input.clientId || crypto.randomUUID()).trim();
  const viewOnce =
    input.viewOnce === true && (type === "image" || type === "video");

  if (!chatId || !senderId || !String(input.senderAuthUid || "").trim() || !input.blob || (type !== "audio" && type !== "image" && type !== "video")) {
    throw Object.assign(new Error("invalid_media_send"), { code: "invalid_media_send" });
  }

  assertAnonDirectViewOnceSendAllowed(viewOnce);

  const scanFile = new File(
    [input.blob],
    type,
    {
      type:
        input.blob.type ||
        (type === "video" ? "video/webm" : type === "audio" ? "audio/webm" : "image/jpeg"),
    },
  );
  const scanResult = await scanUploadFile(scanFile);

  let uploaded: { url: string; path: string };
  try {
    uploaded = await uploadChatMessageMedia(
      chatId,
      clientId,
      input.blob,
      type,
      input.onProgress,
      { viewOnce },
    );
  } catch (error) {
    throw new ChatMediaSendError(
      {
        stage: "upload",
        op: "uploadChatMessageMedia",
        path: "chats/{chatId}/{object}",
        code: String((error as { code?: string }).code || (error as Error).message || "upload"),
      },
      error,
    );
  }

  try {
    const persisted = await persistAnonDirectMessage({
      chatId,
      senderId,
      senderAuthUid: input.senderAuthUid,
      senderTipo: input.senderTipo,
      messageText: "",
      type,
      mediaUrl: uploaded.url,
      source: input.source,
      reply: input.reply,
      clientId,
      viewOnce,
      viewOnceLimit: input.viewOnceLimit,
      autoModerationRequiresBlur: scanResult.requiresBlur,
      moderationRequiresBlur: scanResult.requiresBlur,
      lastMessagePreview: viewOnce
        ? "💣 Bomba"
        : anonDirectMediaLastMessageLabel(type, input.source),
    });

    return {
      messageId: persisted.messageId,
      chatId: persisted.chatId,
      mediaUrl: viewOnce ? "" : uploaded.url,
      storagePath: uploaded.path,
      viewOnce,
      autoModerationRequiresBlur: scanResult.requiresBlur === true,
      moderationRequiresBlur: scanResult.requiresBlur === true,
    };
  } catch (persistError) {
    try {
      await deleteChatMessageMediaAtPath(uploaded.path);
    } catch (cleanupError) {
      throw new ChatMediaSendError(
        {
          stage: "cleanup",
          op: "deleteChatMessageMediaAtPath",
          path: "chats/{chatId}/{object}",
          code: String(
            (cleanupError as { code?: string }).code ||
              (cleanupError as Error).message ||
              "cleanup",
          ),
        },
        cleanupError,
      );
    }
    if (persistError instanceof ChatMediaSendError) throw persistError;
    throw new ChatMediaSendError(
      {
        stage: "persist",
        op: "persistAnonDirectMessage",
        path: "chats_anonimos/{chatId}/mensajes/{id}",
        code: String(
          (persistError as { code?: string }).code ||
            (persistError as Error).message ||
            "persist",
        ),
      },
      persistError,
    );
  }
}

export function describeAnonDirectMediaSendFailure(error: unknown) {
  if (isChatMediaAnonAuthDisabled(error)) return "anon_auth_disabled" as const;
  if (isChatMediaStorageUnauthorized(error)) return "storage_unauthorized" as const;
  const diag = classifyChatMediaSendFailure(error);
  return diag.stage === "upload" ? ("upload" as const) : ("persist" as const);
}
