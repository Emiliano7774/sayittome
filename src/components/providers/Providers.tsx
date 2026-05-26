"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { UxModeProvider } from "@/contexts/UxModeContext";
import AnonymousPresenceBootstrap from "@/components/AnonymousPresenceBootstrap";
import PresenceBootstrap from "@/components/PresenceBootstrap";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <UxModeProvider>
        <PresenceBootstrap />
        <AnonymousPresenceBootstrap />
        {children}
      </UxModeProvider>
    </AuthProvider>
  );
}
