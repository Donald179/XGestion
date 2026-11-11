import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Pencil, Plus } from "lucide-react";
import { db } from "@/db";
import { purchaseOrders, suppliers } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { METHOD_LABELS, fmtDate, fmtMoney } from "@/lib/format";
import { ActionButton, Filters, FormDialog, type Field } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, StatusBadge, Tabs, likeOf, pageOf } from "@/components/ui";
import { archiveSupplierAction, saveSupplierAction } from "@/app/actions/crm";
import { cancelPOAction, payPOAction, receivePOAction, setSupplierInvoiceAction } from "@/app/actions/ops";

export const metadata = { title: "Fournisseurs" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string; supplier?: string; page?: string }> }) {
  const ctx = await pageCtx("suppliers.view");
  const sp = await searchParams;
  const org = ctx.org.id;
  const manage = can(ctx.role, "suppliers.manage");
  const tab = sp.tab === "commandes" ? "commandes" : "fournisseurs";
  const page = pageOf(sp.page);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const tabs = [{ key: "fournisseurs", label: "Fournisseurs" }, { key: "commandes", label: "Commandes d'achat" }];
  const fields = (s?: typeof suppliers.$inferSelect): Field[] => [
    { name: "name", label: "Raison sociale", required: true, defaultValue: s?.name, full: true },
    { name: "contact", label: "Contact", defaultValue: s?.contact }, { name: "phone", label: "Téléphone", type: "tel", defaultValue: s?.phone },
    { name: "email", label: "Email", type: "email", defaultValue: s?.email }, { name: "address", label: "Adresse", defaultValue: s?.address },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: s?.notes },
  ];
  const header = (
    <PageHeader title="Fournisseurs" subtitle="Commandes d'achat, réception de marchandises et montants dus">
      {manage && <FormDialog title="Nouveau fournisseur" trigger={<><Plus className="h-4 w-4" /> Fournisseur</>} fields={fields()} action={saveSupplierAction} />}
      {manage && <Link href="/fournisseurs/commandes/nouvelle" className="btn-outline"><Plus className="h-4 w-4" /> Commande d&apos;achat</Link>}
    </PageHeader>
  );

  if (tab === "commandes") {
    const where = and(eq(purchaseOrders.organizationId, org), sp.status ? eq(purchaseOrders.status, sp.status) : undefined, sp.supplier ? eq(purchaseOrders.supplierId, sp.supplier) : undefined, sp.q ? or(ilike(purchaseOrders.reference, likeOf(sp.q)), ilike(suppliers.name, likeOf(sp.q))) : undefined);
    const [rows, [{ n }], sups] = await Promise.all([
      db.select({ o: purchaseOrders, sname: suppliers.name }).from(purchaseOrders).innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(where).orderBy(desc(purchaseOrders.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
      db.select({ n: sql<number>`count(*)::int` }).from(purchaseOrders).innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(where),
      db.select().from(suppliers).where(eq(suppliers.organizationId, org)).orderBy(asc(suppliers.name)),
    ]);
    return (
      <>
        {header}<Tabs current={tab} items={tabs} />
        <Card>
          <div className="border-b border-slate-100 p-3"><Filters placeholder="Référence ou fournisseur…" selects={[
            { name: "status", label: "Tous les statuts", options: [{ value: "commandee", label: "Commandée" }, { value: "recue", label: "Reçue" }, { value: "annulee", label: "Annulée" }] },
            { name: "supplier", label: "Tous les fournisseurs", options: sups.map((s) => ({ value: s.id, label: s.name })) }]} /></div>
          {rows.length === 0 ? <Empty text="Aucune commande d'achat." /> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Référence</th><th>Fournisseur</th><th>Date</th><th>Facture fourn.</th><th className="text-right">Total</th><th className="text-right">Payé</th><th>Statut</th><th /></tr></thead><tbody>
              {rows.map(({ o, sname }) => (
                <tr key={o.id}><td className="font-medium">{o.reference}</td><td>{sname}</td><td>{fmtDate(o.orderDate)}</td><td>{o.supplierInvoiceRef ?? "—"}</td><td className="text-right font-medium">{M(o.total)}</td>
                  <td className={`text-right ${o.total - o.paid > 0 && o.status !== "annulee" ? "text-orange-600" : "text-emerald-600"}`}>{M(o.paid)}</td><td><StatusBadge status={o.status} /></td>
                  <td><div className="flex flex-wrap justify-end gap-1.5">
                    {manage && o.status === "commandee" && <ActionButton action={receivePOAction} hidden={{ id: o.id }} confirm="Réceptionner cette commande ? Le stock sera augmenté." label="Réceptionner" className="btn-primary btn-sm" />}
                    {manage && o.status !== "annulee" && o.total - o.paid > 0 && (
                      <FormDialog title={`Régler ${o.reference}`} description={`Reste dû : ${M(o.total - o.paid)}`} triggerClass="btn-outline btn-sm" trigger="Régler"
                        fields={[{ name: "amount", label: "Montant", type: "number", min: "0", required: true, defaultValue: o.total - o.paid }, { name: "method", label: "Mode", type: "select", required: true, defaultValue: "virement", options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) }]} hidden={{ id: o.id }} action={payPOAction} />
                    )}
                    {manage && o.status !== "annulee" && <FormDialog title="Facture fournisseur" triggerClass="btn-outline btn-sm" trigger={<Pencil className="h-3.5 w-3.5" />} fields={[{ name: "ref", label: "N° de facture fournisseur", defaultValue: o.supplierInvoiceRef, full: true }]} hidden={{ id: o.id }} action={setSupplierInvoiceAction} />}
                    {manage && o.status === "commandee" && o.paid === 0 && <ActionButton action={cancelPOAction} hidden={{ id: o.id }} confirm="Annuler cette commande ?" label="Annuler" className="btn-outline btn-sm text-red-600" />}
                  </div></td></tr>
              ))}</tbody></table></div>
          )}
          <Pager page={page} total={n} params={sp} />
        </Card>
      </>
    );
  }

  const where = and(eq(suppliers.organizationId, org), eq(suppliers.archived, sp.status === "archive"), sp.q ? or(ilike(suppliers.name, likeOf(sp.q)), ilike(suppliers.contact, likeOf(sp.q)), ilike(suppliers.phone, likeOf(sp.q))) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    db.select({
      s: suppliers,
      due: sql<number>`(select coalesce(sum(total-paid),0) from purchase_orders where supplier_id=${suppliers.id} and status<>'annulee')`,
      count: sql<number>`(select count(*)::int from purchase_orders where supplier_id=${suppliers.id})`,
    }).from(suppliers).where(where).orderBy(asc(suppliers.name)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(suppliers).where(where),
  ]);
  return (
    <>
      {header}<Tabs current={tab} items={tabs} />
      <Card>
        <div className="border-b border-slate-100 p-3"><Filters placeholder="Nom, contact, téléphone…" selects={[{ name: "status", label: "Fournisseurs actifs", options: [{ value: "archive", label: "Archivés" }] }]} /></div>
        {rows.length === 0 ? <Empty text="Aucun fournisseur." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Fournisseur</th><th>Contact</th><th>Téléphone</th><th>Email</th><th>Commandes</th><th className="text-right">Montant dû</th><th /></tr></thead><tbody>
            {rows.map(({ s, due, count }) => (
              <tr key={s.id}><td className="font-medium">{s.name}</td><td>{s.contact ?? "—"}</td><td>{s.phone ?? "—"}</td><td>{s.email ?? "—"}</td>
                <td><Link className="text-brand-700 hover:underline" href={`/fournisseurs?tab=commandes&supplier=${s.id}`}>{count} commande(s)</Link></td>
                <td className="text-right">{Number(due) > 0 ? <Badge tone="orange">{M(Number(due))}</Badge> : <span className="text-slate-400">—</span>}</td>
                <td><div className="flex justify-end gap-2">
                  {manage && <FormDialog title="Modifier le fournisseur" triggerClass="btn-outline btn-sm" trigger={<Pencil className="h-3.5 w-3.5" />} fields={fields(s)} hidden={{ id: s.id }} action={saveSupplierAction} />}
                  {manage && <ActionButton action={archiveSupplierAction} hidden={{ id: s.id, archived: s.archived ? "0" : "1" }} label={s.archived ? "Restaurer" : "Archiver"} confirm={s.archived ? undefined : "Archiver ce fournisseur ?"} />}
                </div></td></tr>
            ))}</tbody></table></div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
    </>
  );
}
