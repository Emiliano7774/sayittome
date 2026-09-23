"use client";

import { useRouter } from "next/navigation";

import ChatInboxAvatar from "@/components/chats/ChatInboxAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useStoryStatus } from "@/hooks/useStoryStatus";
import { chatHref, resolveChatUsername, type InboxChat } from "@/hooks/useChatsInbox";
import {
  shouldHidePeerProfilePhoto,
  shouldShowAnonPeerInbox,
} from "@/lib/chat/inboxPeerTitle";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { clearMainTabShellOverlay } from "@/lib/navigation/mainTabShellBridge";
import { stashProfileReturnTo } from "@/lib/navigation/profileReturnNav";

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
  const { profile } = useAuth();
  const viewerUsername = String(profile?.username || "");
  const viewerPhoto = String(profile?.fotoPrincipal || "");
  const profileUsername = resolveChatUsername(chat);
  const ownerUid = String(chat.targetUid || chat.receptorUid || "");
  const hidePhoto = shouldHidePeerProfilePhoto(
    chat,
    viewerUid,
    viewerUsername,
    viewerPhoto,
  );
  const showAnon = anonAvatar || shouldShowAnonPeerInbox(chat, viewerUid, viewerUsername) || hidePhoto;
  const story = useStoryStatus(hidePhoto ? "" : ownerUid, hidePhoto ? "" : profileUsername);

  function openChat() {
    clearMainTabShellOverlay();
    fastRouterPush(router, chatHref(chat));
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (story.hasActive && story.hasUnseen && story.storyPath) {
      clearMainTabShellOverlay();
      fastRouterPush(router, story.storyPath);
      return;
    }

    if (profileUsername && !hidePhoto) {
      clearMainTabShellOverlay();
      stashProfileReturnTo("/chats");
      fastRouterPush(router, `/u/${encodeURIComponent(profileUsername)}`);
      return;
    }

    openChat();
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
        photo={showAnon ? "" : photo}
        username={username}
        size={size}
        blurPhoto={blurPhoto}
        variant={variant}
        anonAvatar={showAnon}
        anonKey={anonKey}
      />
    </button>
  );
}
