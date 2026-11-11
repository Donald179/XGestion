"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void> };

export function PwaRegister() {
  const [install, setInstall] = useState<BIP | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as BIP); };
    const on = () => setOffline(false), off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return (
    <>
      {offline && (
        <div className="no-print fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-orange-500 px-3 py-1.5 text-xs font-medium text-white">
          <WifiOff className="h-4 w-4" /> Hors connexion : aucune opération n&apos;est enregistrée tant que la connexion n&apos;est pas rétablie.
        </div>
      )}
      {install && (
        <button onClick={async () => { await install.prompt(); setInstall(null); }} className="btn-primary no-print fixed bottom-4 left-4 z-[80] shadow-lg">
          <Download className="h-4 w-4" /> Installer l&apos;application
        </button>
      )}
    </>
  );
}
