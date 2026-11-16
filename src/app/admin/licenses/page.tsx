import { createLicenseAction, getLicensesWithOrgs } from "@/db/licenses";
import { LanguageToggle } from "@/components/language";
import { requireSuperAdmin } from "@/lib/super-admin";
import { LicenseActions } from "./license-actions";

export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  await requireSuperAdmin();
  const allLicenses = await getLicensesWithOrgs();

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <a href="/admin" className="text-sm font-medium text-blue-600 hover:underline">← Retour à l’espace super administrateur</a>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Gestion des Licences SaaS</h1>
          <p className="text-sm text-gray-500">Générez et suivez les clés d'activation de vos clients.</p>
        </div>
        <LanguageToggle />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Générer une nouvelle clé</h2>
        <form action={createLicenseAction} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Type de plan</label>
            <select name="planType" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none">
              <option value="mensuel">Mensuel (30 jours)</option>
              <option value="annuel">Annuel (365 jours)</option>
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-sm font-medium text-gray-700">Max Utilisateurs</label>
            <input type="number" name="maxUsers" defaultValue={3} min={1} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Générer la clé</button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-6"><h2 className="text-lg font-semibold text-gray-800">Licences générées</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
              <th className="p-4 font-medium">Clé de licence</th><th className="p-4 font-medium">Organisation liée</th><th className="p-4 font-medium">Plan</th><th className="p-4 font-medium">Statut</th><th className="p-4 font-medium">Expiration</th><th className="p-4 text-center font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {allLicenses.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-mono font-medium text-blue-600">{l.licenseKey}</td>
                  <td className="p-4 font-medium text-gray-900">{l.orgName || <span className="italic text-gray-400">Non assignée</span>}</td>
                  <td className="p-4 text-xs font-semibold uppercase"><span className="rounded bg-gray-100 px-2 py-1">{l.planType}</span></td>
                  <td className="p-4"><span className={`rounded px-2 py-1 text-xs font-medium ${l.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{l.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="p-4 text-gray-500">{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString("fr-FR") : "Illimitée"}</td>
                  <td className="p-4"><LicenseActions id={l.id} isActive={l.isActive} licenseKey={l.licenseKey} /></td>
                </tr>
              ))}
              {allLicenses.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">Aucune licence générée pour le moment.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
