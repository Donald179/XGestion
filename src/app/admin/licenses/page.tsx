import { createLicenseAction, getLicensesWithOrgs } from "@/db/licenses";

export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  const allLicenses = await getLicensesWithOrgs();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Licences SaaS</h1>
        <p className="text-sm text-gray-500">Générez et suivez les clés d'activation de vos clients.</p>
      </div>

      {/* Formulaire de génération */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold mb-4">Générer une nouvelle clé</h2>
        <form action={createLicenseAction} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de plan</label>
            <select name="planType" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm">
              <option value="mensuel">Mensuel (30 jours)</option>
              <option value="annuel">Annuel (365 jours)</option>
            </select>
          </div>
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Utilisateurs</label>
            <input type="number" name="maxUsers" defaultValue={3} min={1} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm" />
          </div>
          <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition">
            Générer la clé
          </button>
        </form>
      </div>

      {/* Liste des licences */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Licences générées</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b border-gray-100">
                <th className="p-4 font-medium">Clé de licence</th>
                <th className="p-4 font-medium">Organisation liée</th>
                <th className="p-4 font-medium">Plan</th>
                <th className="p-4 font-medium">Statut</th>
                <th className="p-4 font-medium">Expiration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {allLicenses.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-mono font-medium text-blue-600">{l.licenseKey}</td>
                  <td className="p-4 font-medium text-gray-900">{l.orgName || <span className="text-gray-400 italic">Non assignée</span>}</td>
                  <td className="p-4 uppercase text-xs font-semibold"><span className="px-2 py-1 bg-gray-100 rounded">{l.planType}</span></td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${l.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {l.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">
                    {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString("fr-FR") : "Illimitée"}
                  </td>
                </tr>
              ))}
              {allLicenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400">Aucune licence générée pour le moment.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
