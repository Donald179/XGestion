"use client";

import { useState } from "react";
import { deleteLicenseAction, setLicenseStatusAction } from "@/db/licenses";

type LicenseActionsProps = {
  id: string;
  isActive: boolean;
  licenseKey: string;
};

export function LicenseActions({ id, isActive, licenseKey }: LicenseActionsProps) {
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center justify-center gap-2">
      <form action={setLicenseStatusAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="isActive" value={String(!isActive)} />
        <button
          type="submit"
          disabled={pending}
          className={`rounded px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isActive ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isActive ? "Désactiver" : "Activer"}
        </button>
      </form>

      <form
        action={deleteLicenseAction}
        onSubmit={(event) => {
          if (!window.confirm(`Supprimer définitivement la licence ${licenseKey} ?`)) {
            event.preventDefault();
            return;
          }
          setPending(true);
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Supprimer
        </button>
      </form>
    </div>
  );
}
