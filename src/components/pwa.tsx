"use client";

import { useEffect, useState } from "react";
import { Download, Users, WifiOff } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void> };

export function PwaRegister() {
  const [install, setInstall] = useState<BIP | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (navigator.onLine) {
          if ("sync" in registration) await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("xgestion-offline-queue").catch(() => registration.active?.postMessage({ type: "XGESTION_SYNC_OFFLINE_QUEUE" }));
          else registration.active?.postMessage({ type: "XGESTION_SYNC_OFFLINE_QUEUE" });
        }
      }).catch(() => {});
    }
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as BIP); };
    const on = () => {
      setOffline(false);
      if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then((registration) => {
        const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
        if (sync) sync.register("xgestion-offline-queue").catch(() => registration.active?.postMessage({ type: "XGESTION_SYNC_OFFLINE_QUEUE" }));
        else registration.active?.postMessage({ type: "XGESTION_SYNC_OFFLINE_QUEUE" });
      }).catch(() => {});
    };
    const off = () => setOffline(true);
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
          <WifiOff className="h-4 w-4" /> Hors connexion : les nouvelles fiches clients peuvent être mises en attente depuis la saisie hors ligne.
        </div>
      )}
      <a href="/offline.html" className="no-print fixed bottom-4 right-4 z-[80] inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
        <Users className="h-4 w-4" /> Saisie client hors ligne
      </a>
      {install && (
        <button onClick={async () => { await install.prompt(); setInstall(null); }} className="btn-primary no-print fixed bottom-4 left-4 z-[80] shadow-lg">
          <Download className="h-4 w-4" /> Installer l&apos;application
        </button>
      )}
    </>
  );
}
