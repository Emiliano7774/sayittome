"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { AnonMatchProvider } from "@/contexts/AnonMatchContext";
import { ChatAlertsProvider } from "@/contexts/ChatAlertsContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { UxModeProvider } from "@/contexts/UxModeContext";
import AnonymousPresenceBootstrap from "@/components/AnonymousPresenceBootstrap";
import AnonSessionLifecycle from "@/components/AnonSessionLifecycle";
import BoostBootstrap from "@/components/boost/BoostBootstrap";
import NativeAppBootstrap from "@/components/app/NativeAppBootstrap";
import RouteRecoveryBootstrap from "@/components/app/RouteRecoveryBootstrap";
import AdsBootstrap from "@/components/monetization/AdsBootstrap";
import MonetagScripts from "@/components/monetization/MonetagScripts";
import PresenceBootstrap from "@/components/PresenceBootstrap";
import StoriesBootstrap from "@/components/stories/StoriesBootstrap";
import SensitiveConsentBootstrap from "@/components/moderation/SensitiveConsentBootstrap";
import AnonMatchBootstrap from "@/components/anonMatch/AnonMatchBootstrap";
import ChatNotificationPrompt from "@/components/chat/ChatNotificationPrompt";
import MainTabShellPanels from "@/components/navigation/MainTabShellPanels";
import { MainTabShellProvider } from "@/contexts/MainTabShellContext";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
      <AuthProvider>
        <AnonMatchProvider>
        <UxModeProvider>
          <ChatAlertsProvider>
          <MainTabShellProvider>
          <PresenceBootstrap />
          <AnonymousPresenceBootstrap />
          <AnonSessionLifecycle />
          <NativeAppBootstrap />
          <RouteRecoveryBootstrap />
          <AdsBootstrap />
          <MonetagScripts />
          <StoriesBootstrap />
          <SensitiveConsentBootstrap />
          <AnonMatchBootstrap />
          <BoostBootstrap />
          <ChatNotificationPrompt />
          {children}
          <MainTabShellPanels />
          </MainTabShellProvider>
          </ChatAlertsProvider>
        </UxModeProvider>
        </AnonMatchProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
