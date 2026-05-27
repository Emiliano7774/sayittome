import type { Metadata, Viewport } from "next";
import "./globals.css";

import SayItToMeVisualPolish from "@/components/SayItToMeVisualPolish";
import Providers from "@/components/providers/Providers";
import AppNavigation from "@/components/navigation/AppNavigation";

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
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <SayItToMeVisualPolish />
        <Providers>
          {children}
          <AppNavigation />
        </Providers>
      </body>
    </html>
  );
}
