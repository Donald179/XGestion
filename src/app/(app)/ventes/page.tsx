import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Filters } from "@/components/client";
import { Card, Empty, PAGE_SIZE, PageHeader, Pager, StatusBadge, likeOf, pageOf, payState } from "@/components/ui";

export const metadata = { title: "Ventes" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await pageCtx("sales.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const st = sp.status;
  const where = and(
    eq(sales.organizationId, ctx.org.id),
    st === "annulee" ? eq(sales.status, "annulee") : st ? eq(sales.status, "validee") : undefined,
    st === "payee" ? sql`${sales.paid} >= ${sales.total}` : undefined,
    st === "partielle" ? sql`${sales.paid} > 0 and ${sales.paid} < ${sales.total}` : undefined,
    st === "impayee" ? sql`${sales.paid} = 0 and ${sales.total} > 0` : undefined,
    sp.q ? or(ilike(sales.reference, likeOf(sp.q)), ilike(customers.name, likeOf(sp.q))) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    db.select({ s: sales, cname: customers.name }).from(sales).leftJoin(customers, eq(customers.id, sales.customerId)).where(where).orderBy(desc(sales.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(sales).leftJoin(customers, eq(customers.id, sales.customerId)).where(where),
  ]);
  const M = (x: number) => fmtMoney(x, ctx.settings);
  return (
    <>
      <PageHeader title="Ventes" subtitle="Ventes de produits : stock et paiements gérés automatiquement">
        {can(ctx.role, "sales.create") && <Link href="/ventes/nouvelle" className="btn-primary"><Plus className="h-4 w-4" /> Nouvelle vente</Link>}
      </PageHeader>
      <Card>
        <div className="border-b border-slate-100 p-3">
          <Filters placeholder="Référence ou client…" selects={[{ name: "status", label: "Tous les états", options: [{ value: "payee", label: "Payées" }, { value: "partielle", label: "Partiellement payées" }, { value: "impayee", label: "Non payées" }, { value: "annulee", label: "Annulées" }] }]} />
        </div>
        {rows.length === 0 ? <Empty text="Aucune vente." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th className="text-right">Total</th><th className="text-right">Payé</th><th className="text-right">Reste</th><th>État</th></tr></thead><tbody>
            {rows.map(({ s, cname }) => (
              <tr key={s.id}><td><Link href={`/ventes/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.reference}</Link></td><td className="whitespace-nowrap">{fmtDateTime(s.createdAt, ctx.settings.timezone)}</td><td>{cname ?? "Comptoir"}</td>
                <td className="text-right font-medium">{M(s.total)}</td><td className="text-right text-emerald-600">{M(s.paid)}</td>
                <td className={`text-right ${s.total - s.paid > 0 && s.status === "validee" ? "text-red-600" : "text-slate-400"}`}>{s.status === "validee" ? M(s.total - s.paid) : "—"}</td>
                <td>{s.status === "annulee" ? <StatusBadge status="annulee" /> : <StatusBadge status={payState(s.total, s.paid)} />}</td></tr>
            ))}</tbody></table></div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
    </>
  );
}
