import type { SpectatorMessage } from "@/lib/moderation/spectator";

export type AsyncMediaSnapshot = {
  fetchKey: string;
  mediaUrl: string;
  resolvedType: string;
  status: "loading" | "ready" | "error";
  error: string;
};

export function adminMediaScopeKey(chatId: string, msg: SpectatorMessage) {
  const collection = String(msg.collectionName || "mensajes").trim() || "mensajes";
  return `${chatId}/${collection}/${msg.id}`;
}

/** Fetch results apply only when the captured key still matches the active scope. */
export function shouldApplyAdminMediaFetchResult(activeKey: string, resultKey: string) {
  const active = String(activeKey || "").trim();
  const result = String(resultKey || "").trim();
  return Boolean(active) && active === result;
}

export function resolveAdminMediaDisplay(input: {
  needsAdminFetch: boolean;
  inlineUrl: string;
  inlineType: string;
  fetchKey: string;
  asyncMedia: AsyncMediaSnapshot;
}): {
  mediaUrl: string;
  resolvedType: string;
  loading: boolean;
  error: string;
} {
  if (!input.needsAdminFetch) {
    return {
      mediaUrl: input.inlineUrl,
      resolvedType: input.inlineType,
      loading: false,
      error: "",
    };
  }

  const applied = shouldApplyAdminMediaFetchResult(input.fetchKey, input.asyncMedia.fetchKey);
  if (!applied) {
    return {
      mediaUrl: "",
      resolvedType: input.inlineType,
      loading: true,
      error: "",
    };
  }

  if (input.asyncMedia.status === "loading") {
    return {
      mediaUrl: "",
      resolvedType: input.asyncMedia.resolvedType || input.inlineType,
      loading: true,
      error: "",
    };
  }

  if (input.asyncMedia.status === "error") {
    return {
      mediaUrl: "",
      resolvedType: input.asyncMedia.resolvedType || input.inlineType,
      loading: false,
      error: input.asyncMedia.error || "media_unavailable",
    };
  }

  return {
    mediaUrl: input.asyncMedia.mediaUrl,
    resolvedType: input.asyncMedia.resolvedType || input.inlineType,
    loading: false,
    error: "",
  };
}
