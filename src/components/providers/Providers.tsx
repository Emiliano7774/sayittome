"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { UxModeProvider } from "@/contexts/UxModeContext";
import AnonymousPresenceBootstrap from "@/components/AnonymousPresenceBootstrap";
import AnonSessionLifecycle from "@/components/AnonSessionLifecycle";
import MonetagScripts from "@/components/monetization/MonetagScripts";
import PresenceBootstrap from "@/components/PresenceBootstrap";
import StoriesBootstrap from "@/components/stories/StoriesBootstrap";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
      <AuthProvider>
        <UxModeProvider>
          <PresenceBootstrap />
          <AnonymousPresenceBootstrap />
          <AnonSessionLifecycle />
          <MonetagScripts />
          <StoriesBootstrap />
          {children}
        </UxModeProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
