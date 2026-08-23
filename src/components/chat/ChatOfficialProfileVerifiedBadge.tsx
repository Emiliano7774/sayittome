"use client";

import ChatVerifiedProfileLinkCard from "@/components/chat/ChatVerifiedProfileLinkCard";
import useVerifiedOfficialProfileLink from "@/hooks/useVerifiedOfficialProfileLink";

type Props = {
  chatId: string;
  messageId?: string;
  text: string;
  deleted?: boolean;
  attestationHint?: unknown;
  mine?: boolean;
  isClassic?: boolean;
};

export default function ChatOfficialProfileVerifiedBadge({
  chatId,
  messageId,
  text,
  deleted,
  attestationHint,
  mine,
  isClassic,
}: Props) {
  const link = useVerifiedOfficialProfileLink({
    chatId,
    messageId,
    text,
    deleted,
    attestationHint,
  });
  if (!link) return null;
  return <ChatVerifiedProfileLinkCard link={link} mine={mine} isClassic={isClassic} />;
}
