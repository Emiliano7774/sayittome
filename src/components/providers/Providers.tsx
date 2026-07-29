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
import NavCaptureDiagBootstrap from "@/components/dev/NavCaptureDiagBootstrap";
import NavInputDiagBootstrap from "@/components/dev/NavInputDiagBootstrap";
import RealDeviceQaDebugBootstrap from "@/components/dev/RealDeviceQaDebugBootstrap";
import ShuffleKeepAliveHost from "@/components/shuffle/ShuffleKeepAliveHost";
import { ShuffleGlobalSafetyNet } from "@/components/shuffle/ShuffleSurfaceSafety";
import NavTraceBootstrap from "@/components/dev/NavTraceBootstrap";
import NavTraceProfiler from "@/components/dev/NavTraceProfiler";
import MainTabToShuffleSlideStage from "@/components/navigation/MainTabToShuffleSlideStage";

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
          <NavCaptureDiagBootstrap />
          <NavInputDiagBootstrap />
          <RealDeviceQaDebugBootstrap />
          {(process.env.NODE_ENV === "development" ||
            process.env.NEXT_PUBLIC_NAV_TRACE === "1") && <NavTraceBootstrap />}
          <MainTabToShuffleSlideStage />
          <ShuffleGlobalSafetyNet />
          <ShuffleKeepAliveHost />
          <NavTraceProfiler>{children}</NavTraceProfiler>
          </ChatAlertsProvider>
        </UxModeProvider>
        </AnonMatchProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
