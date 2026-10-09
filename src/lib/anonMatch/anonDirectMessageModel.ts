import type { AnonDirectMediaSource, AnonDirectMediaType } from "@/lib/anonMatch/anonDirectMediaLabels";

export type AnonDirectChatMessage = {
  id: string;
  text: string;
  mine: boolean;
  fromId: string;
  type: AnonDirectMediaType;
  mediaUrl?: string;
  source?: AnonDirectMediaSource;
  reply?: string;
  viewOnce?: boolean;
  viewOnceLimit?: number;
  viewOnceOpenedCount?: number;
  viewOnceExhausted?: boolean;
  viewOnceSealed?: boolean;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  clientId?: string;
  /** Firestore server creation time for the usual swipe-to-reveal clock. */
  createdAtMs?: number;
  status?: "sending" | "failed";
};

function asType(value: unknown): AnonDirectChatMessage["type"] {
  const raw = String(value || "text").trim();
  if (raw === "audio" || raw === "image" || raw === "video") return raw;
  return "text";
}

function asSource(value: unknown): AnonDirectMediaSource | undefined {
  const raw = String(value || "").trim();
  if (raw === "camera" || raw === "gallery" || raw === "audio") return raw;
  return undefined;
}

/** Map a Firestore mensaje doc into the anon-direct UI model (0 reads). */
export function mapAnonDirectMessageDoc(input: {
  id: string;
  data: Record<string, unknown>;
  senderId: string;
}): AnonDirectChatMessage {
  const data = input.data || {};
  const fromId = String(data.senderId || "").trim();
  const type = asType(data.type);
  const mediaUrl = String(data.mediaUrl || "").trim();
  const text = String(data.texto || data.text || "").trim();
  const reply = String(data.reply || "").trim();

  const viewOnce = data.viewOnce === true;
  return {
    id: input.id,
    text,
    mine: Boolean(input.senderId) && fromId === input.senderId,
    fromId,
    type,
    // Never expose bomb mediaUrl from the listener — claim delivery only.
    mediaUrl: viewOnce ? undefined : mediaUrl || undefined,
    source: asSource(data.source),
    reply: reply || undefined,
    viewOnce,
    viewOnceLimit:
      data.viewOnceLimit != null ? Math.max(0, Number(data.viewOnceLimit) || 0) : undefined,
    viewOnceOpenedCount:
      data.viewOnceOpenedCount != null
        ? Math.max(0, Number(data.viewOnceOpenedCount) || 0)
        : undefined,
    viewOnceExhausted: data.viewOnceExhausted === true,
    viewOnceSealed: data.viewOnceSealed === true,
    autoModerationRequiresBlur: data.autoModerationRequiresBlur === true,
    moderationRequiresBlur: data.moderationRequiresBlur === true,
    clientId: data.clientId ? String(data.clientId) : undefined,
    createdAtMs: (() => {
      const value = data.createdAt as { toDate?: () => Date; seconds?: number } | Date | string | number | undefined;
      if (!value) return undefined;
      const ms = typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
        ? value.toDate().getTime()
        : typeof value === "object" && "seconds" in value && typeof value.seconds === "number"
          ? value.seconds * 1000
          : new Date(value as string | number).getTime();
      return Number.isFinite(ms) ? ms : undefined;
    })(),
  };
}
