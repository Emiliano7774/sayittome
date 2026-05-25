"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { UxModeProvider } from "@/contexts/UxModeContext";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <UxModeProvider>
        {children}
      </UxModeProvider>
    </AuthProvider>
  );
}
