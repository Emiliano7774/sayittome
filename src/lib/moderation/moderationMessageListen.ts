import { exactChatIdEquals } from "@/lib/moderation/chatHistory";
import type { ModerationMessageCollection } from "@/lib/moderation/moderationMessageCollections";

export type ModerationMessageListenState = {
  generation: number;
  chatId: string;
  aborted: boolean;
  pending: unknown[] | null;
  paintedChatId: string;
};

export function initialModerationMessageListenState(): ModerationMessageListenState {
  return {
    generation: 0,
    chatId: "",
    aborted: true,
    pending: null,
    paintedChatId: "",
  };
}

export function beginModerationMessageListen(
  state: ModerationMessageListenState,
  chatId: string,
): ModerationMessageListenState {
  const nextId = String(chatId || "");
  return {
    generation: state.generation + 1,
    chatId: nextId,
    aborted: !nextId,
    pending: null,
    paintedChatId: "",
  };
}

export function abortModerationMessageListen(
  state: ModerationMessageListenState,
): ModerationMessageListenState {
  return {
    generation: state.generation + 1,
    chatId: "",
    aborted: true,
    pending: null,
    paintedChatId: "",
  };
}

export function shouldAcceptModerationMessageSnapshot(input: {
  state: ModerationMessageListenState;
  snapshotGeneration: number;
  snapshotChatId: string;
  collectionName?: string;
}): boolean {
  if (input.state.aborted) return false;
  if (input.snapshotGeneration !== input.state.generation) return false;
  if (!input.state.chatId) return false;
  if (!exactChatIdEquals(input.state.chatId, input.snapshotChatId)) return false;
  if (
    input.collectionName &&
    input.collectionName !== "mensajes" &&
    input.collectionName !== "messages"
  ) {
    return false;
  }
  return true;
}

export function applyModerationMessageSnapshot(
  state: ModerationMessageListenState,
  input: {
    snapshotGeneration: number;
    snapshotChatId: string;
    collectionName: ModerationMessageCollection;
    rows: unknown[];
  },
): { state: ModerationMessageListenState; accepted: boolean } {
  if (
    !shouldAcceptModerationMessageSnapshot({
      state,
      snapshotGeneration: input.snapshotGeneration,
      snapshotChatId: input.snapshotChatId,
      collectionName: input.collectionName,
    })
  ) {
    return { state, accepted: false };
  }

  return {
    accepted: true,
    state: {
      ...state,
      pending: null,
      paintedChatId: input.snapshotChatId,
    },
  };
}
