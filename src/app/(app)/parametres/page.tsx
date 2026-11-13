import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Building2, KeyRound, Pencil, PlusCircle, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { auditLogs, profiles, licenses } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { FormDialog } from "@/components/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { saveOrgAction, saveSettingsAction } from "@/app/actions/ops";
import { changePasswordAction } from "@/app/actions/auth";
import { activateUserLicenseAction } from "@/db/licenses";

export const metadata = { title: "Paramètres" };

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>;

export default async function SettingsPage() {
  const ctx = await pageCtx("settings.manage");
  const { org, settings: s } = ctx;
  const owner = ctx.role === "proprietaire";
  
  // Récupérer la licence de l'organisation active
  const [currentLicense] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.organizationId, org.id))
    .limit(1);

  const isTrial = currentLicense?.planType?.includes("essai");

  // Calcul du décompte des jours restants
  let remainingDays = 0;
  if (currentLicense?.expiresAt) {
    const diffTime = new Date(currentLicense.expiresAt).getTime() - new Date().getTime();
    remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (remainingDays < 0) remainingDays = 0;
  }

  const expiresAtFormatted = currentLicense?.expiresAt 
    ? new Date(currentLicense.expiresAt).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })
    : "Illimitée";

  const logs = await db.select({ a: auditLogs, who: profiles.fullName }).from(auditLogs).leftJoin(profiles, eq(profiles.id, auditLogs.userId)).where(eq(auditLogs.organizationId, org.id)).orderBy(desc(auditLogs.createdAt)).limit(25);
  
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Entreprise, devise, facturation et règles de stock">
        <Link href="/onboarding" className="btn-outline"><PlusCircle className="h-4 w-4" /> Créer une autre entreprise</Link>
        <FormDialog title="Changer mon mot de passe" triggerClass="btn-outline" trigger={<><KeyRound className="h-4 w-4" /> Mon mot de passe</>}
          fields={[{ name: "current", label: "Mot de passe actuel", type: "password", required: true, full: true }, { name: "password", label: "Nouveau mot de passe (8 car. min.)", type: "password", required: true, full: true }]} action={changePasswordAction} />
      </PageHeader>

      {/* SECTION AJOUTÉE : État de l'abonnement & Licence avec décompte */}
      <Card title="Abonnement et Licence" className="mb-4">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Statut actuel</p>
              <p className={`font-medium mt-1 ${currentLicense?.isActive && remainingDays > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {currentLicense?.isActive && remainingDays > 0 ? (isTrial ? "⏳ Essai gratuit" : "✅ Actif") : "❌ Expiré"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Type de plan</p>
              <p className="font-medium text-slate-800 uppercase mt-1">{currentLicense?.planType || "Aucun"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Jours restants</p>
              <p className={`font-bold mt-1 ${remainingDays <= 3 ? "text-rose-600" : "text-blue-600"}`}>
                {currentLicense?.expiresAt ? `${remainingDays} jour(s)` : "Illimité"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Expiration</p>
              <p className="font-medium text-slate-800 text-sm mt-1">{expiresAtFormatted}</p>
            </div>
          </div>

          {/* Formulaire d'activation de clé */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Activer une nouvelle clé de licence</h3>
            <form action={async (formData) => {
              "use server";
              await activateUserLicenseAction(formData, org.id);
            }} className="flex gap-3">
              <input 
                type="text" 
                name="licenseKey" 
                placeholder="Ex: XGEST-A1B2-C3D4..." 
                required
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-sm bg-white"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition flex items-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" /> Activer la clé
              </button>
            </form>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Informations de l'entreprise" actions={
          <FormDialog title="Informations de l'entreprise" triggerClass="btn-outline btn-sm" trigger={<><Pencil className="h-3.5 w-3.5" /> Modifier</>}
            fields={[
              { name: "name", label: "Nom de l'entreprise", required: true, defaultValue: org.name, full: true },
              { name: "email", label: "Email professionnel", type: "email", defaultValue: org.email }, { name: "phone", label: "Téléphone", type: "tel", defaultValue: org.phone },
              { name: "address", label: "Adresse", defaultValue: org.address, full: true }, { name: "taxId", label: "N° fiscal / RCCM", defaultValue: org.taxId, full: true },
              { name: "logoUrl", label: "Logo (image < 600 Ko)", type: "file", defaultValue: org.logoUrl, full: true },
            ]} action={saveOrgAction} />}>
          <dl className="px-4 py-2">
            <Row k="Logo" v={org.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={org.logoUrl} alt="" className="h-10 w-10 rounded object-contain" /> : <Building2 className="h-5 w-5 text-slate-300" />} />
            <Row k="Nom" v={org.name} /><Row k="Email" v={org.email ?? "—"} /><Row k="Téléphone" v={org.phone ?? "—"} /><Row k="Adresse" v={org.address ?? "—"} /><Row k="N° fiscal" v={org.taxId ?? "—"} />
          </dl>
        </Card>
        <Card title="Devise, régionalisation, facturation et stock" actions={
          <FormDialog title="Paramètres de l'entreprise" triggerClass="btn-outline btn-sm" trigger={<><Pencil className="h-3.5 w-3.5" /> Modifier</>}
            fields={[
              { name: "currency", label: "Code devise ISO", required: true, defaultValue: s.currency }, { name: "currencyLabel", label: "Symbole affiché", required: true, defaultValue: s.currencyLabel },
              { name: "locale", label: "Paramètres régionaux", defaultValue: s.locale }, { name: "timezone", label: "Fuseau horaire", required: true, defaultValue: s.timezone },
              { name: "taxEnabled", label: "Appliquer une taxe (TVA)", type: "checkbox", defaultValue: s.taxEnabled, full: true },
              { name: "taxName", label: "Nom de la taxe", defaultValue: s.taxName }, { name: "taxRate", label: "Taux (%)", type: "number", min: "0", defaultValue: s.taxRate },
              { name: "invoicePrefix", label: "Préfixe factures", defaultValue: s.invoicePrefix }, { name: "quotePrefix", label: "Préfixe devis", defaultValue: s.quotePrefix },
              { name: "salePrefix", label: "Préfixe ventes", defaultValue: s.salePrefix }, { name: "orderPrefix", label: "Préfixe prestations", defaultValue: s.orderPrefix },
              { name: "purchasePrefix", label: "Préfixe commandes d'achat", defaultValue: s.purchasePrefix },
              { name: "paymentTermsDays", label: "Délai de paiement (jours)", type: "number", step: "1", min: "0", defaultValue: s.paymentTermsDays },
              { name: "quoteValidityDays", label: "Validité des devis (jours)", type: "number", step: "1", min: "1", defaultValue: s.quoteValidityDays },
              { name: "invoiceFooter", label: "Pied de page des documents", type: "textarea", defaultValue: s.invoiceFooter },
              ...(owner ? [{ name: "allowNegativeStock", label: "Autoriser le stock négatif (ventes malgré un stock insuffisant)", type: "checkbox" as const, defaultValue: s.allowNegativeStock, full: true }] : []),
            ]} action={saveSettingsAction} />}>
          <dl className="px-4 py-2">
            <Row k="Devise" v={`${s.currencyLabel} (${s.currency})`} /><Row k="Fuseau horaire" v={s.timezone} /><Row k="Format de date" v="JJ/MM/AAAA" />
            <Row k="Taxe" v={s.taxEnabled ? `${s.taxName} ${s.taxRate} %` : "Non applicable"} />
            <Row k="Préfixes" v={`${s.invoicePrefix} · ${s.quotePrefix} · ${s.salePrefix} · ${s.orderPrefix} · ${s.purchasePrefix}`} />
            <Row k="Délai de paiement" v={`${s.paymentTermsDays} jours`} /><Row k="Validité des devis" v={`${s.quoteValidityDays} jours`} />
            <Row k="Stock négatif" v={s.allowNegativeStock ? <Badge tone="orange">Autorisé</Badge> : <Badge tone="green">Interdit</Badge>} />
          </dl>
          {!owner && <p className="px-4 pb-3 text-xs text-slate-400">Seul le propriétaire peut modifier la règle de stock négatif.</p>}
        </Card>
      </div>
      <Card title="Journal d'audit (25 dernières actions)" className="mt-4">
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th></tr></thead><tbody>
          {logs.map(({ a, who }) => <tr key={a.id}><td className="whitespace-nowrap">{fmtDateTime(a.createdAt, s.timezone)}</td><td>{who ?? "—"}</td><td><Badge>{a.action}</Badge></td><td>{a.entity}</td></tr>)}
        </tbody></table></div>
      </Card>
    </>
  );
}
