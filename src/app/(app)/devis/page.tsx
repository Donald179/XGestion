import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { customers, quotes } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { Filters } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, StatusBadge, likeOf, pageOf } from "@/components/ui";

export const metadata = { title: "Devis" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await pageCtx("quotes.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const where = and(eq(quotes.organizationId, ctx.org.id), sp.status ? eq(quotes.status, sp.status) : undefined, sp.q ? or(ilike(quotes.reference, likeOf(sp.q)), ilike(customers.name, likeOf(sp.q))) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    db.select({ q: quotes, cname: customers.name }).from(quotes).innerJoin(customers, eq(customers.id, quotes.customerId)).where(where).orderBy(desc(quotes.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(quotes).innerJoin(customers, eq(customers.id, quotes.customerId)).where(where),
  ]);
  const t = today(ctx.settings.timezone);
  return (
    <>
      <PageHeader title="Devis" subtitle="Créez, envoyez et convertissez vos devis en factures">
        {can(ctx.role, "quotes.manage") && <Link href="/devis/nouveau" className="btn-primary"><Plus className="h-4 w-4" /> Nouveau devis</Link>}
      </PageHeader>
      <Card>
        <div className="border-b border-slate-100 p-3"><Filters placeholder="Référence ou client…" selects={[{ name: "status", label: "Tous les statuts", options: ["brouillon", "envoye", "accepte", "refuse", "converti"].map((v) => ({ value: v, label: { brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé", converti: "Converti" }[v]! })) }]} /></div>
        {rows.length === 0 ? <Empty text="Aucun devis." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Référence</th><th>Client</th><th>Date</th><th>Validité</th><th className="text-right">Total</th><th>Statut</th></tr></thead><tbody>
            {rows.map(({ q, cname }) => (
              <tr key={q.id}><td><Link href={`/devis/${q.id}`} className="font-medium text-brand-700 hover:underline">{q.reference}</Link></td><td>{cname}</td><td>{fmtDate(q.issueDate)}</td>
                <td>{fmtDate(q.validUntil)} {q.validUntil && q.validUntil < t && ["brouillon", "envoye"].includes(q.status) && <Badge tone="orange">Expiré</Badge>}</td>
                <td className="text-right font-medium">{fmtMoney(q.total, ctx.settings)}</td><td><StatusBadge status={q.status} /></td></tr>
            ))}</tbody></table></div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
    </>
  );
}
