"use client";

import AnonDirectChatWindow from "@/components/anonMatch/AnonDirectChatWindow";
import { usePathname } from "next/navigation";
import { useAnonMatchOptional } from "@/contexts/AnonMatchContext";
import AnonMatchIncomingModal from "@/components/anonMatch/AnonMatchIncomingModal";
import AnonMatchSearchingBanner from "@/components/anonMatch/AnonMatchSearchingBanner";

export default function AnonMatchBootstrap() {
  const pathname = usePathname();
  const match = useAnonMatchOptional();
  const pageDM = /^\/chat\/asd_/.test(pathname || "");
  const persistentDM = match?.openChat?.chatId?.startsWith("asd_") === true;
  // No random-match popup or search banner over a normal direct-chat page.
  if (pageDM) return null;
  return (
    <>
      <AnonMatchIncomingModal />
      <AnonMatchSearchingBanner />
      {!pageDM && !persistentDM ? <AnonDirectChatWindow /> : null}
    </>
  );
}
