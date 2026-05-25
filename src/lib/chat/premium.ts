export type PremiumChatUpload = {
  id: string;
  progress: number;
  state: "uploading" | "done" | "error";
};

export type OnceViewState = {
  opened: boolean;
  openedAt?: number;
};

export function makeUploadId() {
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

export function prettyAudioTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
