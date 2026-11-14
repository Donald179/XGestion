import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
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
    <html lang="fr" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("xgestion-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch{}`,
          }}
        />
      </head>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
