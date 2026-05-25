import type { Metadata } from "next";
import "./globals.css";

import SayItToMeVisualPolish from "@/components/SayItToMeVisualPolish";
import Providers from "@/components/providers/Providers";
import BottomNav from "@/components/navigation/BottomNav";

export const metadata: Metadata = {
  title: "SayItToMe",
  description: "SayItToMe",
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
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
