"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ChatAlertsProvider } from "@/contexts/ChatAlertsContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { UxModeProvider } from "@/contexts/UxModeContext";
import AnonymousPresenceBootstrap from "@/components/AnonymousPresenceBootstrap";
import AnonSessionLifecycle from "@/components/AnonSessionLifecycle";
import NativeAppBootstrap from "@/components/app/NativeAppBootstrap";
import NativeAdMobBootstrap from "@/components/monetization/NativeAdMobBootstrap";
import NativeAdsRouteCleanup from "@/components/monetization/NativeAdsRouteCleanup";
import MonetagScripts from "@/components/monetization/MonetagScripts";
import PresenceBootstrap from "@/components/PresenceBootstrap";
import StoriesBootstrap from "@/components/stories/StoriesBootstrap";
import SensitiveConsentBootstrap from "@/components/moderation/SensitiveConsentBootstrap";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
      <AuthProvider>
        <UxModeProvider>
          <ChatAlertsProvider>
          <PresenceBootstrap />
          <AnonymousPresenceBootstrap />
          <AnonSessionLifecycle />
          <NativeAppBootstrap />
          <NativeAdMobBootstrap />
          <NativeAdsRouteCleanup />
          <MonetagScripts />
          <StoriesBootstrap />
          <SensitiveConsentBootstrap />
          {children}
          </ChatAlertsProvider>
        </UxModeProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
