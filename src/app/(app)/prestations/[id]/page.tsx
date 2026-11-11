import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { FileText, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { db } from "@/db";
import { auditLogs, customers, invoices, organizationMembers, profiles, serviceOrderItems, serviceOrders, services } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, today } from "@/lib/format";
import { ActionButton, FormDialog } from "@/components/client";
import { Badge, Card, Empty, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { addOrderCostAction, deleteOrderCostAction, orderInvoiceAction, orderStatusAction, saveOrderAction } from "@/app/actions/ops";

const STATUS_OPTIONS = [["en_attente", "En attente"], ["acceptee", "Acceptée"], ["en_cours", "En cours"], ["en_pause", "En pause"], ["terminee", "Terminée"], ["livree", "Livrée"], ["annulee", "Annulée"]];
const ACTION_FR: Record<string, string> = { create: "Création", update: "Modification", status: "Changement de statut", cost_added: "Coût ajouté", cost_removed: "Coût supprimé" };

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx("orders.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const org = ctx.org.id;
  const manage = can(ctx.role, "orders.manage");
  const [o] = await db.select().from(serviceOrders).where(and(eq(serviceOrders.id, id), eq(serviceOrders.organizationId, org)));
  if (!o || (!manage && o.assigneeId !== ctx.user.id)) notFound();
  const [[c], costs, history, [who], [inv], custs, svcs, members] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, o.customerId)),
    db.select().from(serviceOrderItems).where(eq(serviceOrderItems.orderId, id)).orderBy(asc(serviceOrderItems.createdAt)),
    db.select({ a: auditLogs, who: profiles.fullName }).from(auditLogs).leftJoin(profiles, eq(profiles.id, auditLogs.userId)).where(and(eq(auditLogs.organizationId, org), eq(auditLogs.entity, "service_order"), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.createdAt)).limit(30),
    o.assigneeId ? db.select().from(profiles).where(eq(profiles.id, o.assigneeId)) : Promise.resolve([]),
    o.invoiceId ? db.select().from(invoices).where(eq(invoices.id, o.invoiceId)) : Promise.resolve([]),
    manage ? db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.organizationId, org)).orderBy(asc(customers.name)) : Promise.resolve([]),
    manage ? db.select().from(services).where(eq(services.organizationId, org)).orderBy(asc(services.name)) : Promise.resolve([]),
    manage ? db.select({ id: profiles.id, name: profiles.fullName }).from(organizationMembers).innerJoin(profiles, eq(profiles.id, organizationMembers.userId)).where(and(eq(organizationMembers.organizationId, org), eq(organizationMembers.active, true))) : Promise.resolve([]),
  ]);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const tz = ctx.settings.timezone;
  const totalCost = costs.reduce((a, x) => a + x.quantity * x.unitCost, 0);
  const late = o.dueDate && o.dueDate < today(tz) && !["terminee", "livree", "annulee"].includes(o.status);
  return (
    <>
      <PageHeader title={`${o.reference} · ${o.title}`} subtitle={`Créée le ${fmtDateTime(o.createdAt, tz)}`}>
        <Link href="/prestations" className="btn-outline">← Prestations</Link>
        <FormDialog title="Mettre à jour la prestation" trigger={<><RefreshCw className="h-4 w-4" /> Statut / progression</>}
          fields={[
            { name: "status", label: "Statut", type: "select", required: true, defaultValue: o.status, options: STATUS_OPTIONS.filter(([v]) => manage || v !== "annulee").map(([value, label]) => ({ value, label })) },
            { name: "progress", label: "Progression (%)", type: "number", step: "1", min: "0", defaultValue: o.progress },
            { name: "internalNotes", label: "Notes internes", type: "textarea", defaultValue: o.internalNotes },
          ]} hidden={{ id }} action={orderStatusAction} />
        {manage && (
          <FormDialog title="Modifier la prestation" triggerClass="btn-outline" trigger={<><Pencil className="h-4 w-4" /> Modifier</>}
            fields={[
              { name: "customerId", label: "Client", type: "select", required: true, defaultValue: o.customerId, options: custs.map((x) => ({ value: x.id, label: x.name })), full: true },
              { name: "serviceId", label: "Service", type: "select", defaultValue: o.serviceId, options: svcs.map((x) => ({ value: x.id, label: x.name })) },
              { name: "title", label: "Intitulé", required: true, defaultValue: o.title },
              { name: "description", label: "Description", type: "textarea", defaultValue: o.description },
              { name: "price", label: "Prix convenu", type: "number", min: "0", required: true, defaultValue: o.price },
              { name: "assigneeId", label: "Employé responsable", type: "select", defaultValue: o.assigneeId, options: members.map((x) => ({ value: x.id, label: x.name })) },
              { name: "dueDate", label: "Date prévue", type: "date", defaultValue: o.dueDate },
              { name: "internalNotes", label: "Notes internes", type: "textarea", defaultValue: o.internalNotes },
            ]} hidden={{ id }} action={saveOrderAction} />
        )}
        {manage && !o.invoiceId && o.status !== "annulee" && can(ctx.role, "invoices.manage") && <ActionButton action={orderInvoiceAction} hidden={{ id }} className="btn-primary" label={<><FileText className="h-4 w-4" /> Générer la facture</>} confirm="Générer une facture pour cette prestation ?" />}
        {inv && <Link href={`/factures/${inv.id}`} className="btn-outline">Facture {inv.reference}</Link>}
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatCard label="Statut" value={{ en_attente: "En attente", acceptee: "Acceptée", en_cours: "En cours", en_pause: "En pause", terminee: "Terminée", livree: "Livrée", annulee: "Annulée" }[o.status] ?? o.status} tone="violet" />
        <StatCard label="Prix convenu" value={M(o.price)} />
        <StatCard label="Coûts enregistrés" value={M(totalCost)} tone="orange" />
        <StatCard label="Marge estimée" value={M(o.price - totalCost)} tone={o.price - totalCost >= 0 ? "green" : "red"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Détails">
          <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Client</dt><dd><Link className="text-brand-700 hover:underline" href={`/clients/${c.id}`}>{c.name}</Link></dd></div>
            <div><dt className="text-xs text-slate-500">Employé responsable</dt><dd>{who?.fullName ?? "Non attribuée"}</dd></div>
            <div><dt className="text-xs text-slate-500">Date prévue</dt><dd>{fmtDate(o.dueDate)} {late && <Badge tone="red">En retard</Badge>}</dd></div>
            <div><dt className="text-xs text-slate-500">Terminée le</dt><dd>{o.completedAt ? fmtDateTime(o.completedAt, tz) : "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Progression</dt><dd className="mt-1 flex items-center gap-2"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${o.progress}%` }} /></div><b>{o.progress}%</b></dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Description</dt><dd className="whitespace-pre-wrap">{o.description ?? "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Notes internes</dt><dd className="whitespace-pre-wrap">{o.internalNotes ?? "—"}</dd></div>
          </dl>
        </Card>
        <Card title="Coûts liés à la prestation" actions={
          <FormDialog title="Ajouter un coût" triggerClass="btn-outline btn-sm" trigger={<><Plus className="h-3.5 w-3.5" /> Ajouter</>}
            fields={[{ name: "label", label: "Libellé (pièce, déplacement…)", required: true, full: true }, { name: "quantity", label: "Quantité", type: "number", step: "1", min: "1", defaultValue: 1 }, { name: "unitCost", label: "Coût unitaire", type: "number", min: "0", required: true }]}
            hidden={{ orderId: id }} action={addOrderCostAction} />}>
          {costs.length === 0 ? <Empty text="Aucun coût enregistré." /> : (
            <table className="tbl"><thead><tr><th>Libellé</th><th className="text-right">Qté</th><th className="text-right">Coût unit.</th><th className="text-right">Total</th><th /></tr></thead><tbody>
              {costs.map((x) => <tr key={x.id}><td>{x.label}</td><td className="text-right">{x.quantity}</td><td className="text-right">{M(x.unitCost)}</td><td className="text-right font-medium">{M(x.quantity * x.unitCost)}</td>
                <td className="text-right">{manage && <ActionButton action={deleteOrderCostAction} hidden={{ id: x.id, orderId: id }} confirm="Supprimer ce coût ?" label={<Trash2 className="h-3.5 w-3.5" />} className="btn-outline btn-sm text-red-600" />}</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Card title="Historique des modifications" className="lg:col-span-2">
          {history.length === 0 ? <Empty text="Aucun historique." /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {history.map(({ a, who }) => {
                const d = (a.details ?? {}) as Record<string, unknown>;
                return <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5"><span className="w-36 text-xs text-slate-400">{fmtDateTime(a.createdAt, tz)}</span><b>{ACTION_FR[a.action] ?? a.action}</b>
                  {a.action === "status" && <span className="text-slate-600"><StatusBadge status={String(d.from)} /> → <StatusBadge status={String(d.to)} /> ({String(d.progress)}%)</span>}
                  {a.action === "cost_added" && <span className="text-slate-600">{String(d.label)} × {String(d.quantity)}</span>}
                  <span className="ml-auto text-xs text-slate-500">par {who ?? "—"}</span></li>;
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
