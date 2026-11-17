import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  FileText,
  Package,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import { db } from "@/db";
import { invoices, products, sales } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BarChart, DonutChart } from "@/components/dashboard-charts";

export const metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

export default async function DashboardPage() {
  const ctx = await pageCtx();
  const { org, settings } = ctx;
  const now = new Date();
  const chartStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const saleMonth = sql<string>`to_char(date_trunc('month', ${sales.createdAt}), 'YYYY-MM')`;
  const invoiceMonth = sql<string>`to_char(date_trunc('month', ${invoices.createdAt}), 'YYYY-MM')`;

  // Aggregate in PostgreSQL instead of transferring every historical row to the server.
  const [
    [salesTotals],
    [invoiceTotals],
    monthlySales,
    monthlyInvoices,
    [stockTotals],
    lowStockProducts,
    recentSales,
    recentInvoices,
  ] = await Promise.all([
    db.select({
      total: sql<number>`coalesce(sum(${sales.total}), 0)::float8`,
      count: sql<number>`count(*)::int`,
    }).from(sales).where(eq(sales.organizationId, org.id)),
    db.select({
      paid: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.status} = 'payee'), 0)::float8`,
      pending: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.status} in ('en_attente', 'partielle')), 0)::float8`,
      pendingCount: sql<number>`count(*) filter (where ${invoices.status} in ('en_attente', 'partielle'))::int`,
    }).from(invoices).where(eq(invoices.organizationId, org.id)),
    db.select({ month: saleMonth, total: sql<number>`coalesce(sum(${sales.total}), 0)::float8` })
      .from(sales).where(and(eq(sales.organizationId, org.id), gte(sales.createdAt, chartStart)))
      .groupBy(saleMonth),
    db.select({ month: invoiceMonth, total: sql<number>`coalesce(sum(${invoices.total}), 0)::float8` })
      .from(invoices).where(and(eq(invoices.organizationId, org.id), eq(invoices.status, "payee"), gte(invoices.createdAt, chartStart)))
      .groupBy(invoiceMonth),
    db.select({ count: sql<number>`count(*)::int` }).from(products)
      .where(and(eq(products.organizationId, org.id), eq(products.active, true), sql`${products.quantity} <= ${products.alertThreshold}`)),
    db.select({ id: products.id, name: products.name, quantity: products.quantity })
      .from(products).where(and(eq(products.organizationId, org.id), eq(products.active, true), sql`${products.quantity} <= ${products.alertThreshold}`))
      .orderBy(products.quantity).limit(8),
    db.select({ id: sales.id, reference: sales.reference, createdAt: sales.createdAt, total: sales.total })
      .from(sales).where(eq(sales.organizationId, org.id)).orderBy(desc(sales.createdAt)).limit(5),
    db.select({ id: invoices.id, reference: invoices.reference, status: invoices.status, total: invoices.total })
      .from(invoices).where(eq(invoices.organizationId, org.id)).orderBy(desc(invoices.createdAt)).limit(5),
  ]);

  const salesByMonth = new Map(monthlySales.map((row) => [row.month, Number(row.total)]));
  const invoicesByMonth = new Map(monthlyInvoices.map((row) => [row.month, Number(row.total)]));
  const monthlyChartData = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: MONTHS[date.getMonth()],
      value: (salesByMonth.get(key) ?? 0) + (invoicesByMonth.get(key) ?? 0),
    };
  });
  const totalSalesAmount = Number(salesTotals.total);
  const totalInvoicesPaid = Number(invoiceTotals.paid);
  const totalInvoicesPending = Number(invoiceTotals.pending);
  const pendingInvoiceCount = Number(invoiceTotals.pendingCount);
  const lowStockCount = Number(stockTotals.count);
  const money = (amount: number) => fmtMoney(amount, settings as any);
  const donutData = [
    { label: "Ventes directes", value: totalSalesAmount || 1, color: "#2563eb" },
    { label: "Factures encaissées", value: totalInvoicesPaid || 1, color: "#10b981" },
    { label: "Factures en attente", value: totalInvoicesPending || 1, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Bonjour, ${ctx.user.fullName}`} subtitle={`Tableau de bord de ${org.name}`}>
        <Link href="/ventes/nouvelle" className="btn-primary"><Plus className="h-4 w-4" /> Nouvelle vente</Link>
        <Link href="/factures/nouvelle" className="btn-outline"><FileText className="h-4 w-4" /> Nouvelle facture</Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Chiffre d'affaires encaissé</span><div className="rounded-lg bg-blue-50 p-2 text-blue-600"><Banknote className="h-5 w-5" /></div></div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{money(totalSalesAmount + totalInvoicesPaid)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600"><TrendingUp className="h-3.5 w-3.5" /> Ventes + Factures payées</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Factures en attente</span><div className="rounded-lg bg-amber-50 p-2 text-amber-600"><FileText className="h-5 w-5" /></div></div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{money(totalInvoicesPending)}</p>
          <p className="mt-1 text-xs text-slate-500">{pendingInvoiceCount} facture(s) à recouvrer</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Total Ventes</span><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><Users className="h-5 w-5" /></div></div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{Number(salesTotals.count)}</p>
          <Link href="/ventes" className="mt-1 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">Voir les ventes <ArrowUpRight className="h-3 w-3" /></Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Alertes de stock</span><div className={`rounded-lg p-2 ${lowStockCount > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"}`}><Package className="h-5 w-5" /></div></div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{lowStockCount}</p>
          <Link href="/stocks" className="mt-1 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">Gérer l'inventaire <ArrowUpRight className="h-3 w-3" /></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><BarChart data={monthlyChartData} /><DonutChart items={donutData} /></div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Dernières ventes" actions={<Link href="/ventes" className="text-xs font-medium text-blue-600 hover:underline">Tout voir</Link>}>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Réf.</th><th>Date</th><th className="text-right">Montant</th></tr></thead><tbody>
            {recentSales.map((sale) => <tr key={sale.id}><td className="font-medium text-slate-800"><Link href={`/ventes/${sale.id}`} className="hover:text-blue-600">{sale.reference}</Link></td><td className="text-slate-500">{fmtDate(sale.createdAt, settings.timezone)}</td><td className="text-right font-semibold text-slate-900">{money(Number(sale.total))}</td></tr>)}
            {recentSales.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-sm text-slate-400">Aucune vente enregistrée.</td></tr>}
          </tbody></table></div>
        </Card>
        <Card title="Dernières factures" actions={<Link href="/factures" className="text-xs font-medium text-blue-600 hover:underline">Tout voir</Link>}>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Numéro</th><th>Statut</th><th className="text-right">Total</th></tr></thead><tbody>
            {recentInvoices.map((invoice) => <tr key={invoice.id}><td className="font-medium text-slate-800"><Link href={`/factures/${invoice.id}`} className="hover:text-blue-600">{invoice.reference ?? invoice.id.slice(0, 8)}</Link></td><td><Badge tone={invoice.status === "payee" ? "green" : invoice.status === "annulee" ? "red" : "orange"}>{invoice.status}</Badge></td><td className="text-right font-semibold text-slate-900">{money(Number(invoice.total))}</td></tr>)}
            {recentInvoices.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-sm text-slate-400">Aucune facture enregistrée.</td></tr>}
          </tbody></table></div>
        </Card>
      </div>

      {lowStockProducts.length > 0 && <Card title="Produits nécessitant un réapprovisionnement"><div className="flex flex-wrap gap-3 p-4">
        {lowStockProducts.map((product) => <div key={product.id} className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" /><span className="font-medium text-slate-800">{product.name}</span><Badge tone="red">Reste : {product.quantity}</Badge></div>)}
      </div></Card>}
    </div>
  );
}
