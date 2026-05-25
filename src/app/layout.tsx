import SayItToMeVisualPolish from "@/components/SayItToMeVisualPolish";
import "./globals.css";

import Providers from "@/components/providers/Providers";

import BottomNav from "@/components/navigation/BottomNav";


export const metadata = {
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
