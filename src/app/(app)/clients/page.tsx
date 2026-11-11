import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, likeOf, pageOf } from "@/components/ui";
import { Filters, FormDialog } from "@/components/client";
import { saveCustomerAction } from "@/app/actions/crm";
import { customerFields } from "@/lib/forms";

export const metadata = { title: "Clients" };
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; archived?: string; page?: string }> }) {
  const ctx = await pageCtx("customers.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const manage = can(ctx.role, "customers.manage");
  const where = and(
    eq(customers.organizationId, ctx.org.id),
    eq(customers.archived, sp.archived === "1"),
    sp.type ? eq(customers.type, sp.type) : undefined,
    sp.q ? or(ilike(customers.name, likeOf(sp.q)), ilike(customers.phone, likeOf(sp.q)), ilike(customers.email, likeOf(sp.q))) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        c: customers,
        balance: sql<number>`(select coalesce(sum(total-paid),0) from sales where customer_id=${customers.id} and status='validee' and invoice_id is null)
          + (select coalesce(sum(total-paid),0) from invoices where customer_id=${customers.id} and type='facture' and status in ('emise','partielle'))`,
      })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  return (
    <>
      <PageHeader title="Clients" subtitle="Particuliers et entreprises">
        {manage && <FormDialog title="Nouveau client" trigger={<><Plus className="h-4 w-4" /> Nouveau client</>} fields={customerFields()} action={saveCustomerAction} />}
      </PageHeader>
      <Card>
        <div className="border-b border-slate-100 p-3">
          <Filters placeholder="Nom, téléphone, email…" selects={[
            { name: "type", label: "Tous les types", options: [{ value: "particulier", label: "Particuliers" }, { value: "entreprise", label: "Entreprises" }] },
            { name: "archived", label: "Clients actifs", options: [{ value: "1", label: "Clients archivés" }] },
          ]} />
        </div>
        {rows.length === 0 ? <Empty text={sp.q ? "Aucun client ne correspond à la recherche." : "Aucun client pour le moment."} /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Client</th><th>Type</th><th>Téléphone</th><th>Email</th><th>Créé le</th><th className="text-right">Solde dû</th></tr></thead>
              <tbody>
                {rows.map(({ c, balance }) => (
                  <tr key={c.id}>
                    <td><Link href={`/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link></td>
                    <td><Badge tone={c.type === "entreprise" ? "violet" : "gray"}>{c.type === "entreprise" ? "Entreprise" : "Particulier"}</Badge></td>
                    <td>{c.phone ?? "—"}</td><td>{c.email ?? "—"}</td><td>{fmtDate(c.createdAt, ctx.settings.timezone)}</td>
                    <td className={`text-right font-medium ${Number(balance) > 0 ? "text-red-600" : "text-slate-500"}`}>{fmtMoney(Number(balance), ctx.settings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
    </>
  );
}
