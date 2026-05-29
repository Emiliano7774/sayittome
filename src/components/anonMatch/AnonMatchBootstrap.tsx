"use client";

import AnonDirectChatWindow from "@/components/anonMatch/AnonDirectChatWindow";
import AnonMatchIncomingModal from "@/components/anonMatch/AnonMatchIncomingModal";

export default function AnonMatchBootstrap() {
  return (
    <>
      <AnonMatchIncomingModal />
      <AnonDirectChatWindow />
    </>
  );
}
