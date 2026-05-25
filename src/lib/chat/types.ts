export type ChatMessage = {
  id: string;

  senderUid: string;
  receiverUid: string;

  senderAnonId?: string;

  type?:
    | "text"
    | "audio"
    | "image";

  text: string;

  mediaUrl?: string;

  createdAt?: unknown;

  deliveredTo?: Record<
    string,
    boolean
  >;

  seenBy?: Record<
    string,
    boolean
  >;

  replyToId?: string;
  replyToText?: string;

  optimistic?: boolean;
};

export type ChatInbox = {
  chatId: string;

  participantes: string[];

  updatedAt?: unknown;

  lastMessage: string;

  unreadCounts?: Record<
    string,
    number
  >;

  anonId?: string;

  targetUsername?: string;

  targetPhoto?: string;
};
