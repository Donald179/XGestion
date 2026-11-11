import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { db } from "@/db";
import { customers, invoices, payments, quotes, sales, serviceOrders } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, METHOD_LABELS } from "@/lib/format";
import { ActionButton, FormDialog } from "@/components/client";
import { Badge, Card, Empty, PageHeader, StatCard, StatusBadge, payState } from "@/components/ui";
import { archiveCustomerAction, saveCustomerAction } from "@/app/actions/crm";
import { customerFields } from "@/lib/forms";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx("customers.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const org = ctx.org.id;
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.organizationId, org)));
  if (!c) notFound();
  const [sl, so, inv, qt, pay] = await Promise.all([
    db.select().from(sales).where(and(eq(sales.organizationId, org), eq(sales.customerId, id))).orderBy(desc(sales.createdAt)).limit(50),
    db.select().from(serviceOrders).where(and(eq(serviceOrders.organizationId, org), eq(serviceOrders.customerId, id))).orderBy(desc(serviceOrders.createdAt)).limit(50),
    db.select().from(invoices).where(and(eq(invoices.organizationId, org), eq(invoices.customerId, id))).orderBy(desc(invoices.createdAt)).limit(50),
    db.select().from(quotes).where(and(eq(quotes.organizationId, org), eq(quotes.customerId, id))).orderBy(desc(quotes.createdAt)).limit(50),
    db.select().from(payments).where(and(eq(payments.organizationId, org), eq(payments.customerId, id))).orderBy(desc(payments.paidAt)).limit(50),
  ]);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const balance =
    sl.filter((x) => x.status === "validee" && !x.invoiceId).reduce((a, x) => a + x.total - x.paid, 0) +
    inv.filter((x) => x.type === "facture" && (x.status === "emise" || x.status === "partielle")).reduce((a, x) => a + x.total - x.paid, 0);
  const manage = can(ctx.role, "customers.manage");
  const tz = ctx.settings.timezone;
  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.type === "entreprise" ? "Entreprise" : "Particulier"} · client depuis le ${fmtDate(c.createdAt, tz)}${c.archived ? " · ARCHIVÉ" : ""}`}>
        <Link href="/clients" className="btn-outline">← Clients</Link>
        {manage && <FormDialog title="Modifier le client" triggerClass="btn-outline" trigger={<><Pencil className="h-4 w-4" /> Modifier</>} fields={customerFields(c)} hidden={{ id: c.id }} action={saveCustomerAction} />}
        {manage && <ActionButton action={archiveCustomerAction} hidden={{ id: c.id, archived: c.archived ? "0" : "1" }} className="btn-outline" confirm={c.archived ? undefined : "Archiver ce client ? Son historique est conservé."} label={c.archived ? <><ArchiveRestore className="h-4 w-4" /> Restaurer</> : <><Archive className="h-4 w-4" /> Archiver</>} />}
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Solde restant dû" value={M(balance)} tone={balance > 0 ? "red" : "green"} />
        <StatCard label="Total des ventes" value={M(sl.filter((x) => x.status === "validee").reduce((a, x) => a + x.total, 0))} />
        <StatCard label="Total encaissé" value={M(pay.reduce((a, p) => a + p.amount, 0))} tone="green" />
      </div>
      <Card title="Coordonnées" className="mb-4">
        <dl className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Téléphone</dt><dd>{c.phone ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Email</dt><dd>{c.email ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Adresse</dt><dd>{c.address ?? "—"}</dd></div>
          {c.notes && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{c.notes}</dd></div>}
        </dl>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Ventes (${sl.length})`}>
          {sl.length === 0 ? <Empty text="Aucune vente." /> : <table className="tbl"><thead><tr><th>Référence</th><th>Date</th><th>Total</th><th>État</th></tr></thead><tbody>
            {sl.map((x) => <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/ventes/${x.id}`}>{x.reference}</Link></td><td>{fmtDate(x.createdAt, tz)}</td><td>{M(x.total)}</td><td>{x.status === "annulee" ? <StatusBadge status="annulee" /> : <StatusBadge status={payState(x.total, x.paid)} />}</td></tr>)}
          </tbody></table>}
        </Card>
        <Card title={`Prestations (${so.length})`}>
          {so.length === 0 ? <Empty text="Aucune prestation." /> : <table className="tbl"><thead><tr><th>Référence</th><th>Intitulé</th><th>Prix</th><th>Statut</th></tr></thead><tbody>
            {so.map((x) => <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/prestations/${x.id}`}>{x.reference}</Link></td><td>{x.title}</td><td>{M(x.price)}</td><td><StatusBadge status={x.status} /></td></tr>)}
          </tbody></table>}
        </Card>
        <Card title={`Factures (${inv.length})`}>
          {inv.length === 0 ? <Empty text="Aucune facture." /> : <table className="tbl"><thead><tr><th>Référence</th><th>Date</th><th>Total</th><th>Reste</th><th>État</th></tr></thead><tbody>
            {inv.map((x) => <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/factures/${x.id}`}>{x.reference}</Link></td><td>{fmtDate(x.issueDate)}</td><td>{M(x.total)}</td><td>{x.type === "avoir" || x.status === "annulee" ? "—" : M(x.total - x.paid)}</td><td>{x.type === "avoir" ? <Badge tone="violet">Avoir</Badge> : <StatusBadge status={x.status} />}</td></tr>)}
          </tbody></table>}
        </Card>
        <Card title={`Devis (${qt.length})`}>
          {qt.length === 0 ? <Empty text="Aucun devis." /> : <table className="tbl"><thead><tr><th>Référence</th><th>Date</th><th>Total</th><th>Statut</th></tr></thead><tbody>
            {qt.map((x) => <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/devis/${x.id}`}>{x.reference}</Link></td><td>{fmtDate(x.issueDate)}</td><td>{M(x.total)}</td><td><StatusBadge status={x.status} /></td></tr>)}
          </tbody></table>}
        </Card>
        <Card title={`Paiements (${pay.length})`} className="lg:col-span-2">
          {pay.length === 0 ? <Empty text="Aucun paiement." /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Reçu</th><th>Date</th><th>Mode</th><th className="text-right">Montant</th></tr></thead><tbody>
            {pay.map((x) => <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/recu/${x.id}`}>{x.reference}</Link></td><td>{fmtDate(x.paidAt, tz)}</td><td>{METHOD_LABELS[x.method]}</td><td className={`text-right font-medium ${x.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{M(x.amount)}</td></tr>)}
          </tbody></table></div>}
        </Card>
      </div>
    </>
  );
}
