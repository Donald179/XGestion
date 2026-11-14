import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/client";
import { PwaRegister } from "@/components/pwa";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: { default: "GestionPro – Gestion d'entreprise", template: "%s · GestionPro" },
  description: "Plateforme SaaS de gestion : prestations, ventes, stocks, facturation et finances.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "GestionPro", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0b1b3b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
