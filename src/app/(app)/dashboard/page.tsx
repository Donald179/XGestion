import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  ArrowUpRight,
  Banknote,
  FileText,
  Package,
  Plus,
  TrendingUp,
  Users,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/db";
import {
  invoices,
  products,
  sales,
} from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BarChart, DonutChart } from "@/components/dashboard-charts";

export const metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await pageCtx();
  const { org, settings } = ctx;
  const currency = settings.currencyLabel || "FCFA";

  // 1. Récupération sécurisée des données en base de données
  const [
    allSales,
    allInvoices,
    allProducts,
    recentSales,
    recentInvoices,
  ] = await Promise.all([
    db.select().from(sales).where(eq(sales.organizationId, org.id)),
    db.select().from(invoices).where(eq(invoices.organizationId, org.id)),
    db.select().from(products).where(eq(products.organizationId, org.id)),
    db
      .select()
      .from(sales)
      .where(eq(sales.organizationId, org.id))
      .orderBy(desc(sales.createdAt))
      .limit(5),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.organizationId, org.id))
      .orderBy(desc(invoices.createdAt))
      .limit(5),
  ]);

  // 2. Calculs des montants financiers
  const totalSalesAmount = allSales.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0
  );
  const totalInvoicesPaid = allInvoices
    .filter((inv) => inv.status === "payee")
    .reduce((sum, item) => sum + Number(item.total || 0), 0);
  const totalInvoicesPending = allInvoices
    .filter((inv) => inv.status === "en_attente" || inv.status === "partielle")
    .reduce((sum, item) => sum + Number(item.total || 0), 0);

  const totalRevenue = totalSalesAmount + totalInvoicesPaid;

  // Produits en alerte de stock bas
  const lowStockProducts = allProducts.filter((p: any) => {
    const stockVal = Number(p.stock ?? p.quantity ?? p.stockQuantity ?? 0);
    const minAlert = Number(p.minStock ?? p.minStockAlert ?? 5);
    return stockVal <= minAlert;
  });

  // 3. Données pour le graphique en bâtons (6 derniers mois)
  const monthNames = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", 
    "Juil", "Août", "Sept", "Oct", "Nov", "Déc"
  ];
  const now = new Date();
  const monthlyChartData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const m = d.getMonth();
    const y = d.getFullYear();

    const salesMonth = allSales
      .filter((s) => {
        const sd = new Date(s.createdAt);
        return sd.getMonth() === m && sd.getFullYear() === y;
      })
      .reduce((acc, s) => acc + Number(s.total || 0), 0);

    const invMonth = allInvoices
      .filter((inv) => {
        const idate = new Date(inv.createdAt);
        return (
          inv.status === "payee" &&
          idate.getMonth() === m &&
          idate.getFullYear() === y
        );
      })
      .reduce((acc, inv) => acc + Number(inv.total || 0), 0);

    return {
      label: monthNames[m],
      value: salesMonth + invMonth,
    };
  });

  // 4. Données pour le graphique sphérique (Donut)
  const donutData = [
    {
      label: "Ventes directes",
      value: totalSalesAmount || 1,
      color: "#2563eb",
    },
    {
      label: "Factures encaissées",
      value: totalInvoicesPaid || 1,
      color: "#10b981",
    },
    {
      label: "Factures en attente",
      value: totalInvoicesPending || 1,
      color: "#f59e0b",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bonjour, ${ctx.user.fullName}`}
        subtitle={`Tableau de bord de ${org.name}`}
      >
        <Link href="/ventes/nouvelle" className="btn-primary">
          <Plus className="h-4 w-4" /> Nouvelle vente
        </Link>
        <Link href="/factures/nouvelle" className="btn-outline">
          <FileText className="h-4 w-4" /> Nouvelle facture
        </Link>
      </PageHeader>

      {/* CARTES KPI PRINCIPALES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">
              Chiffre d'affaires encaissé
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Banknote className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {fmtMoney(totalRevenue, settings as any)}
          </p>
          <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1 font-medium">
            <TrendingUp className="h-3.5 w-3.5" /> Ventes + Factures payées
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">
              Factures en attente
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {fmtMoney(totalInvoicesPending, settings as any)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {
              allInvoices.filter(
                (i) => i.status === "en_attente" || i.status === "partielle"
              ).length
            }{" "}
            facture(s) à recouvrer
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">
              Total Ventes
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {allSales.length}
          </p>
          <Link
            href="/ventes"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1 font-medium"
          >
            Voir les ventes <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">
              Alertes de stock
            </span>
            <div
              className={`p-2 rounded-lg ${
                lowStockProducts.length > 0
                  ? "bg-rose-50 text-rose-600"
                  : "bg-slate-50 text-slate-600"
              }`}
            >
              <Package className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">
            {lowStockProducts.length}
          </p>
          <Link
            href="/stocks"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1 font-medium"
          >
            Gérer l'inventaire <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* GRAPHIQUES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart data={monthlyChartData} />
        <DonutChart items={donutData} />
      </div>

      {/* DERNIÈRES OPÉRATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Dernières ventes"
          actions={
            <Link
              href="/ventes"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Tout voir
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Date</th>
                  <th className="text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-medium text-slate-800">
                      <Link
                        href={`/ventes/${sale.id}`}
                        className="hover:text-blue-600"
                      >
                        {sale.reference}
                      </Link>
                    </td>
                    <td className="text-slate-500">
                      {fmtDate(sale.createdAt, settings.timezone)}
                    </td>
                    <td className="text-right font-semibold text-slate-900">
                      {fmtMoney(Number(sale.total), settings as any)}
                    </td>
                  </tr>
                ))}
                {recentSales.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center py-6 text-slate-400 text-sm"
                    >
                      Aucune vente enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Dernières factures"
          actions={
            <Link
              href="/factures"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Tout voir
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Statut</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-medium text-slate-800">
                      <Link
                        href={`/factures/${inv.id}`}
                        className="hover:text-blue-600"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td>
                      <Badge
                        tone={
                          inv.status === "payee"
                            ? "green"
                            : inv.status === "annulee"
                            ? "red"
                            : "orange"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="text-right font-semibold text-slate-900">
                      {fmtMoney(Number(inv.total), settings as any)}
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center py-6 text-slate-400 text-sm"
                    >
                      Aucune facture enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ALERTE PRODUITS EN RUPTURE */}
      {lowStockProducts.length > 0 && (
        <Card title="Produits nécessitant un réapprovisionnement">
          <div className="p-4 flex flex-wrap gap-3">
            {lowStockProducts.slice(0, 8).map((prod: any) => (
              <div
                key={prod.id}
                className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg text-sm"
              >
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span className="font-medium text-slate-800">{prod.name}</span>
                <Badge tone="red">Reste : {prod.stock ?? prod.quantity ?? 0}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
