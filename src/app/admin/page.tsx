import Link from "next/link";
import { sql } from "drizzle-orm";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { licenses, organizations } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/super-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace super administrateur" };

export default async function SuperAdminPage() {
  await requireSuperAdmin();

  const [[{ totalCompanies }], [{ licensedCompanies }]] = await Promise.all([
    db.select({ totalCompanies: sql<number>`count(*)::int` }).from(organizations),
    db.select({ licensedCompanies: sql<number>`count(distinct ${licenses.organizationId})::int` })
      .from(licenses)
      .where(sql`${licenses.organizationId} is not null and ${licenses.isActive} = true and (${licenses.expiresAt} is null or ${licenses.expiresAt} > now())`),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4">
      <header className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Accès auteur</p>
          <h1 className="text-3xl font-bold text-slate-900">Espace super administrateur</h1>
          <p className="mt-1 text-slate-600">Vue globale des entreprises et accès à la gestion des licences.</p>
        </div>
      </header>

      <section aria-label="Statistiques des entreprises" className="grid gap-5 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-600">Entreprises inscrites</p>
            <Building2 className="h-5 w-5 text-brand-700" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{totalCompanies}</p>
          <p className="mt-1 text-sm text-slate-500">Nombre total d’entreprises créées sur XGestion.</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-600">Entreprises avec licence active</p>
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-4 text-4xl font-bold text-slate-900">{licensedCompanies}</p>
          <p className="mt-1 text-sm text-slate-500">Licence active et non expirée.</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Gestion de la plateforme</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Créez des clés de licence et consultez les licences générées ou associées aux entreprises.</p>
        <Link href="/admin/licenses" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-800">
          Accéder à la gestion des licences <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
