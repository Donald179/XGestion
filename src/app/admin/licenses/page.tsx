import { createLicenseAction, getLicensesWithOrgs } from "@/actions/licenses";

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
            <select name="planType" className="w-full border rounded-lg p-2 text-sm bg-white">
              <option value="trial">Essai (14 jours)</option>
              <option value="mensuel">Mensuel (30 jours)</option>
              <option value="annuel">Annuel (1 an)</option>
              <option value="lifetime">À vie (Illimité)</option>
            </select>
          </div>

          <div className="w-36">
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Utilisateurs</label>
            <input 
              type="number" 
              name="maxUsers" 
              defaultValue={3} 
              min={1} 
              className="w-full border rounded-lg p-2 text-sm" 
            />
          </div>

          <button 
            type="submit" 
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition"
          >
            Générer la clé
          </button>
        </form>
      </div>

      {/* Tableau des licences */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 font-semibold text-gray-800">
          Clés générées ({allLicenses.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="p-3">Clé de Licence</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Entreprise cliente</th>
                <th className="p-3">Max Utilisateurs</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Expiration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allLicenses.map((lic) => (
                <tr key={lic.id} className="hover:bg-gray-50">
                  <td className="p-3 font-mono font-medium text-blue-600">{lic.licenseKey}</td>
                  <td className="p-3 capitalize">{lic.planType}</td>
                  <td className="p-3 font-medium text-gray-800">
                    {lic.orgName || <span className="text-gray-400 italic">Non attribuée</span>}
                  </td>
                  <td className="p-3">{lic.maxUsers}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      lic.isActive && (!lic.expiresAt || new Date() < new Date(lic.expiresAt))
                        ? "bg-green-100 text-green-700" 
                        : "bg-red-100 text-red-700"
                    }`}>
                      {lic.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">
                    {lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : "Aucune (À vie)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
