import Link from "next/link";
import { AlertTriangle, Banknote, Boxes, CheckCircle2, CircleDollarSign, Clock, Package, PiggyBank, ShoppingBag, TrendingDown, TrendingUp, Users, Wrench } from "lucide-react";
import { pageCtx } from "@/lib/auth";
import { getDashboard } from "@/lib/stats";
import { PERIODS, METHOD_LABELS, fmtDate, fmtMoney, fmtNum, resolveRange } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import { PeriodPicker } from "@/components/client";
import { DashboardCharts } from "@/components/charts";

export const metadata = { title: "Tableau de bord" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const ctx = await pageCtx("dashboard.view");
  const sp = await searchParams;
  const tz = ctx.settings.timezone;
  const range = resolveRange(sp, tz);
  const d = await getDashboard(ctx.org.id, range, tz);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const nothing = d.customers === 0 && d.products === 0 && d.ca === 0 && d.depenses === 0;
  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`Du ${fmtDate(range.from)} au ${fmtDate(range.to)} · indicateurs calculés depuis vos données réelles`}>
        <PeriodPicker periods={PERIODS} current={range.period} from={range.from} to={range.to} />
      </PageHeader>
      {nothing && (
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50 p-4 text-sm text-slate-700">
          <span>Bienvenue ! Commencez par ajouter vos clients, produits et prestations. Les indicateurs se rempliront automatiquement.</span>
          <span className="flex gap-2"><Link href="/clients" className="btn-primary btn-sm">Ajouter un client</Link><Link href="/produits" className="btn-outline btn-sm">Ajouter un produit</Link></span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Chiffre d'affaires" value={M(d.ca)} icon={<TrendingUp className="h-5 w-5" />} hint="Ventes + prestations facturées" />
        <StatCard label="Total des ventes" value={M(d.ventes)} icon={<ShoppingBag className="h-5 w-5" />} />
        <StatCard label="Total des prestations" value={M(d.prestations)} icon={<Wrench className="h-5 w-5" />} tone="violet" />
        <StatCard label="Total des dépenses" value={M(d.depenses)} icon={<TrendingDown className="h-5 w-5" />} tone="red" />
        <StatCard label="Bénéfice estimé" value={M(d.benefice)} icon={<PiggyBank className="h-5 w-5" />} tone={d.benefice >= 0 ? "green" : "red"} hint="CA − dépenses" />
        <StatCard label="Paiements reçus" value={M(d.encaisse)} icon={<Banknote className="h-5 w-5" />} tone="green" hint="Encaissé sur la période" />
        <StatCard label="Impayés (créances)" value={M(d.impayes)} icon={<CircleDollarSign className="h-5 w-5" />} tone="red" hint="Reste dû à ce jour" />
        <StatCard label="Clients" value={fmtNum(d.customers)} icon={<Users className="h-5 w-5" />} tone="gray" />
        <StatCard label="Produits actifs" value={fmtNum(d.products)} icon={<Package className="h-5 w-5" />} tone="gray" />
        <StatCard label="Alertes de stock" value={fmtNum(d.low)} icon={d.low ? <AlertTriangle className="h-5 w-5" /> : <Boxes className="h-5 w-5" />} tone={d.low ? "orange" : "gray"} hint="Stock ≤ seuil" />
        <StatCard label="Prestations en cours" value={fmtNum(d.running)} icon={<Clock className="h-5 w-5" />} tone="orange" hint={`${d.waiting} en attente`} />
        <StatCard label="Prestations terminées" value={fmtNum(d.done)} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint="Sur la période" />
      </div>
      <div className="mt-5">
        <DashboardCharts
          series={d.series}
          top={d.top}
          perSeller={d.perSeller}
          byMethod={d.byMethod}
          split={[{ name: "Ventes", value: d.ventes }, { name: "Prestations", value: d.prestations }]}
          currency={ctx.settings.currencyLabel}
          methodLabels={METHOD_LABELS}
        />
      </div>
    </>
  );
}
