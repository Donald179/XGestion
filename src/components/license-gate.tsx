"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function LicenseGate({ expired, children }: { expired: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const isSettingsPage = pathname === "/parametres" || pathname.startsWith("/parametres/");

  if (!expired || isSettingsPage) return children;

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-500/45 p-4 backdrop-grayscale"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="license-expired-title"
        aria-describedby="license-expired-description"
      >
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-700" aria-hidden="true">
            !
          </div>
          <h1 id="license-expired-title" className="text-xl font-bold text-slate-900">
            Licence expirée
          </h1>
          <p id="license-expired-description" className="mt-2 text-sm leading-6 text-slate-600">
            L’application est désactivée jusqu’au renouvellement de votre licence. Vous pouvez toujours accéder aux paramètres pour saisir une nouvelle clé.
          </p>
          <Link href="/parametres" className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-800">
            Aller aux paramètres
          </Link>
        </section>
      </div>
    </>
  );
}
