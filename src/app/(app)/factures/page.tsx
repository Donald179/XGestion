import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { Filters } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, StatusBadge, likeOf, pageOf } from "@/components/ui";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await pageCtx("invoices.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const t = today(ctx.settings.timezone);
  const st = sp.status;
  const where = and(
    eq(invoices.organizationId, ctx.org.id),
    st === "avoir" ? eq(invoices.type, "avoir") : undefined,
    st === "retard" ? and(eq(invoices.type, "facture"), sql`${invoices.status} in ('emise','partielle')`, sql`${invoices.dueDate} < ${t}::date`) : undefined,
    st && !["avoir", "retard"].includes(st) ? and(eq(invoices.type, "facture"), eq(invoices.status, st)) : undefined,
    sp.q ? or(ilike(invoices.reference, likeOf(sp.q)), ilike(customers.name, likeOf(sp.q))) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    db.select({ i: invoices, cname: customers.name }).from(invoices).leftJoin(customers, eq(customers.id, invoices.customerId)).where(where).orderBy(desc(invoices.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(invoices).leftJoin(customers, eq(customers.id, invoices.customerId)).where(where),
  ]);
  const M = (x: number) => fmtMoney(x, ctx.settings);
  return (
    <>
      <PageHeader title="Factures" subtitle="Les factures émises ne sont jamais supprimées : elles s'annulent par avoir.">
        {can(ctx.role, "invoices.manage") && <Link href="/factures/nouvelle" className="btn-primary"><Plus className="h-4 w-4" /> Nouvelle facture</Link>}
      </PageHeader>
      <Card>
        <div className="border-b border-slate-100 p-3">
          <Filters placeholder="Référence ou client…" selects={[{ name: "status", label: "Tous les états", options: [{ value: "emise", label: "Émises (impayées)" }, { value: "partielle", label: "Partiellement payées" }, { value: "payee", label: "Payées" }, { value: "retard", label: "En retard" }, { value: "annulee", label: "Annulées" }, { value: "avoir", label: "Avoirs" }] }]} />
        </div>
        {rows.length === 0 ? <Empty text="Aucune facture." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Référence</th><th>Client</th><th>Émission</th><th>Échéance</th><th className="text-right">Total</th><th className="text-right">Reste</th><th>État</th></tr></thead><tbody>
            {rows.map(({ i, cname }) => {
              const live = i.type === "facture" && (i.status === "emise" || i.status === "partielle");
              return (
                <tr key={i.id}><td><Link href={`/factures/${i.id}`} className="font-medium text-brand-700 hover:underline">{i.reference}</Link></td><td>{cname ?? "Comptoir"}</td><td>{fmtDate(i.issueDate)}</td>
                  <td>{i.type === "avoir" ? "—" : fmtDate(i.dueDate)} {live && i.dueDate && i.dueDate < t && <Badge tone="red">En retard</Badge>}</td>
                  <td className="text-right font-medium">{i.type === "avoir" ? "− " : ""}{M(i.total)}</td>
                  <td className={`text-right ${live ? "text-red-600" : "text-slate-400"}`}>{live ? M(i.total - i.paid) : "—"}</td>
                  <td>{i.type === "avoir" ? <Badge tone="violet">Avoir</Badge> : <StatusBadge status={i.status} />}</td></tr>
              );
            })}</tbody></table></div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
    </>
  );
}
