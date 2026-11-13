import { db } from "@/db";
import { licenses, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pageCtx } from "@/lib/auth";
import { activateUserLicenseAction } from "@/db/licenses";
import { Building2, KeyRound, Save } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ParametresPage() {
  const ctx = await pageCtx();

  // Récupérer la licence de l'orga courante
  const [currentLicense] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.organizationId, ctx.org.id))
    .limit(1);

  const isTrial = currentLicense?.planType?.includes("essai");
  const expiresAtFormatted = currentLicense?.expiresAt 
    ? new Date(currentLicense.expiresAt).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })
    : "Illimitée";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres de l'entreprise</h1>
        <p className="text-sm text-gray-500">Gérez les informations de votre structure et votre abonnement SaaS.</p>
      </div>

      {/* 1. SECTION : État de l'abonnement & Licence */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-600" />
          Abonnement et Licence
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
          <div>
            <p className="text-sm text-gray-500">Statut actuel</p>
            <p className={`font-medium ${currentLicense?.isActive ? "text-green-600" : "text-red-600"}`}>
              {currentLicense?.isActive ? (isTrial ? "⏳ Période d'essai active" : "✅ Licence Active") : "❌ Expirée"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Type de plan</p>
            <p className="font-medium text-gray-900 uppercase">{currentLicense?.planType || "Aucun"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Date d'expiration</p>
            <p className="font-medium text-gray-900">{expiresAtFormatted}</p>
          </div>
        </div>

        {/* Formulaire pour entrer un code de licence */}
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-md font-medium text-gray-800 mb-2">Activer une nouvelle clé de licence</h3>
          <form action={async (formData) => {
            "use server";
            await activateUserLicenseAction(formData, ctx.org.id);
          }} className="flex gap-3">
            <input 
              type="text" 
              name="licenseKey" 
              placeholder="Ex: XGEST-A1B2-C3D4..." 
              required
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-sm"
            />
            <button 
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition"
            >
              Activer la clé
            </button>
          </form>
        </div>
      </div>

      {/* 2. SECTION : Informations générales de l'entreprise */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          Informations de l'entreprise
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
            <input 
              type="text" 
              defaultValue={ctx.org.name} 
              disabled 
              className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email professionnel</label>
            <input 
              type="email" 
              defaultValue={ctx.org.email || ""} 
              disabled 
              className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
            <input 
              type="text" 
              defaultValue={ctx.org.phone || ""} 
              disabled 
              className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input 
              type="text" 
              defaultValue={ctx.org.address || ""} 
              disabled 
              className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
