import type { Timestamp } from "firebase/firestore";

export type ModerationChatRow = {
  id: string;
  targetUsername?: string;
  receptorUsername?: string;
  receptorUid?: string;
  targetUid?: string;
  initiatorUid?: string;
  anonOwnerUid?: string;
  anonSessionId?: string;
  lastMessage?: string;
  lastMessageSender?: string;
  anon?: boolean;
  senderIsAnonymous?: boolean;
  suspicious?: boolean;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  moderationReviewedAt?: Timestamp;
};

export type ModerationProfileRow = {
  id: string;
  username: string;
  usernameKey?: string;
  lastModerationActivityMs?: number;
  lastMessagePreview?: string;
  lastChatId?: string;
  unseen?: boolean;
  uid?: string;
};

export type ModerationUserFeedEntry = {
  username: string;
  uid?: string;
  photoUrl?: string;
  lastActivityMs: number;
  lastMessage: string;
  lastChatId: string;
  unseen: boolean;
  chatCount: number;
};

export type TemporalChatSection = {
  id: string;
  label: string;
  chats: ModerationChatRow[];
};
