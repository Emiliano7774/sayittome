"use client";

import AnonDirectChatWindow from "@/components/anonMatch/AnonDirectChatWindow";
import AnonMatchIncomingModal from "@/components/anonMatch/AnonMatchIncomingModal";
import AnonMatchSearchingBanner from "@/components/anonMatch/AnonMatchSearchingBanner";

export default function AnonMatchBootstrap() {
  return (
    <>
      <AnonMatchIncomingModal />
      <AnonMatchSearchingBanner />
      <AnonDirectChatWindow />
    </>
  );
}
