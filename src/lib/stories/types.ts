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
  /** Small cached still image for video cards; never use the original video as a feed preview. */
  thumbnailUrl?: string;
  /** Lightweight 3s-forward/3s-reverse silent preview (not the original video). */
  boomerangUrl?: string;
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
