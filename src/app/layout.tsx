import type { Metadata, Viewport } from "next";
import "./globals.css";

import SayItToMeVisualPolish from "@/components/SayItToMeVisualPolish";
import VisualViewportInset from "@/components/layout/VisualViewportInset";
import Providers from "@/components/providers/Providers";
import AppNavigation from "@/components/navigation/AppNavigation";
import { MainTabShellProvider } from "@/contexts/MainTabShellContext";
import { CHATS_PREPAINT_BOOTSTRAP_SCRIPT } from "@/lib/chats/chatsPrepaintBootstrapInline";

export const metadata: Metadata = {
  title: "SayItToMe",
  description: "SayItToMe",
  applicationName: "SayItToMe",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/icons/Icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SayItToMe",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171717",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        {/* Pre-paint: SoftNavigate remount may paint Chats skeleton before React
            hydrates suppress. Inline bootstrap reads session marker / until and
            installs CSS datasets before first visible paint. Direct cold has no marker. */}
        <script
          dangerouslySetInnerHTML={{ __html: CHATS_PREPAINT_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body>
        <SayItToMeVisualPolish />
        <VisualViewportInset />
        <Providers>
          <MainTabShellProvider chrome={<AppNavigation />}>{children}</MainTabShellProvider>
        </Providers>
      </body>
    </html>
  );
}
