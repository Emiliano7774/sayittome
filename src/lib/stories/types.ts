export type StoryMediaType = "image" | "video" | "text";

/** camera = live capture; gallery = picked from device library */
export type StoryMediaSource = "camera" | "gallery";

export type StoryItem = {
  id: string;
  ownerUid: string;
  ownerUsername?: string;
  ownerPhoto?: string;
  isAnonymousStory?: boolean;
  anonSessionId?: string;
  texto?: string;
  mediaUrl?: string;
  mediaType: StoryMediaType;
  mediaSource?: StoryMediaSource;
  createdAtMs: number;
  expiresAtMs: number;
  likeCount: number;
  viewCount: number;
  durationMs?: number;
  moderationRequiresBlur?: boolean;
  autoModerationRequiresBlur?: boolean;
  adminForceBlur?: boolean;
  adminDeleted?: boolean;
  likedBy?: Record<string, boolean>;
  viewedBy?: Record<string, boolean>;
  viewedByAnon?: Record<string, boolean>;
};

export type StoryUserGroup = {
  ownerUid: string;
  ownerUsername: string;
  ownerPhoto: string;
  isAnonymousStory?: boolean;
  stories: StoryItem[];
  hasUnseen: boolean;
};
