"use client";

import { useRouter } from "next/navigation";

import ChatInboxAvatar from "@/components/chats/ChatInboxAvatar";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { resolveChatUsername, type InboxChat } from "@/hooks/useChatsInbox";
import { shouldHidePeerProfilePhoto } from "@/lib/chat/inboxPeerTitle";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";

type Props = {
  chat: InboxChat;
  viewerUid: string;
  photo: string;
  blurPhoto: boolean;
  username: string;
  size?: "sm" | "md" | "lg";
  variant?: "classic" | "modern";
  anonAvatar?: boolean;
  anonKey?: string;
};

export default function ChatInboxPeerAvatar({
  chat,
  viewerUid,
  photo,
  blurPhoto,
  username,
  size = "md",
  variant = "modern",
  anonAvatar = false,
  anonKey = "",
}: Props) {
  const router = useRouter();
  const profileUsername = resolveChatUsername(chat);
  const ownerUid = String(chat.targetUid || chat.receptorUid || "");
  const story = useStoryStatus(ownerUid, profileUsername);
  const hidePhoto = shouldHidePeerProfilePhoto(chat, viewerUid);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (story.hasActive && story.hasUnseen && story.storyPath) {
      fastRouterPush(router, story.storyPath);
      return;
    }

    if (profileUsername && !hidePhoto) {
      fastRouterPush(router, `/u/${encodeURIComponent(profileUsername)}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="shrink-0 rounded-full active:scale-[0.98]"
      aria-label={
        story.hasActive && story.hasUnseen
          ? `Ver historias de ${username}`
          : `Abrir perfil de ${username}`
      }
    >
      <ChatInboxAvatar
        photo={photo}
        username={username}
        size={size}
        blurPhoto={blurPhoto}
        variant={variant}
        anonAvatar={anonAvatar}
        anonKey={anonKey}
      />
    </button>
  );
}
