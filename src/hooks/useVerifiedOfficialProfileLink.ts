"use client";

import { useEffect, useState } from "react";

import {
  decideOfficialProfileLinkRender,
  readAttestationHint,
  type OfficialProfileLinkVerifyResult,
} from "@/lib/chat/officialProfileLinkMessage";
import { callVerifyVerifiedProfileLink } from "@/lib/chat/verifiedProfileLinkVerify";

type Input = {
  chatId: string;
  messageId?: string;
  text: string;
  deleted?: boolean;
  attestationHint?: unknown;
  callVerify?: (payload: {
    chatId: string;
    messageId: string;
    ticketId: string;
  }) => Promise<{ ok?: boolean; username?: string }>;
};

export default function useVerifiedOfficialProfileLink(input: Input) {
  const hint = readAttestationHint(input.attestationHint);
  const ticketId = hint?.ticketId || "";
  const requestKey = [
    input.chatId,
    input.messageId || "",
    ticketId,
    input.text,
    input.deleted ? "1" : "0",
  ].join("\u0001");
  const [verified, setVerified] = useState<{
    key: string;
    result: OfficialProfileLinkVerifyResult;
  }>({ key: "", result: null });

  useEffect(() => {
    if (!ticketId || !input.chatId || !input.messageId || input.deleted) return undefined;

    let cancelled = false;
    void callVerifyVerifiedProfileLink(
      {
        chatId: input.chatId,
        messageId: input.messageId,
        ticketId,
      },
      input.callVerify,
    ).then((result) => {
      if (!cancelled) setVerified({ key: requestKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, ticketId, input.chatId, input.deleted, input.messageId, input.callVerify]);

  const activeResult = verified.key === requestKey ? verified.result : null;
  return decideOfficialProfileLinkRender(
    {
      id: input.messageId,
      chatId: input.chatId,
      text: input.text,
      deletedForEveryone: input.deleted,
      verifiedProfileAttestation: input.attestationHint,
    },
    activeResult,
  );
}
