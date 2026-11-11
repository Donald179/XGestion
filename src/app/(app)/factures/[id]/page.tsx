import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Ban, Plus } from "lucide-react";
import { db } from "@/db";
import { customers, invoiceItems, invoices, payments } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, METHOD_LABELS, today } from "@/lib/format";
import { DocumentView } from "@/components/document-view";
import { FormDialog, PrintButton } from "@/components/client";
import { Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import { addPaymentAction, cancelInvoiceAction } from "@/app/actions/ops";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx("invoices.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const org = ctx.org.id;
  const [i] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.organizationId, org)));
  if (!i) notFound();
  const [items, pays, cust, related] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)),
    db.select().from(payments).where(and(eq(payments.organizationId, org), eq(payments.invoiceId, id))).orderBy(asc(payments.paidAt)),
    i.customerId ? db.select().from(customers).where(eq(customers.id, i.customerId)) : Promise.resolve([]),
    i.type === "avoir" && i.parentInvoiceId ? db.select().from(invoices).where(eq(invoices.id, i.parentInvoiceId)) : db.select().from(invoices).where(and(eq(invoices.organizationId, org), eq(invoices.parentInvoiceId, id))),
  ]);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const tz = ctx.settings.timezone;
  const live = i.type === "facture" && (i.status === "emise" || i.status === "partielle");
  const remaining = i.total - i.paid;
  const overdue = live && i.dueDate && i.dueDate < today(tz);
  return (
    <>
      <PageHeader title={`${i.type === "avoir" ? "Avoir" : "Facture"} ${i.reference}`}>
        <Link href="/factures" className="btn-outline">← Factures</Link>
        <PrintButton />
        {live && can(ctx.role, "payments.create") && (
          <FormDialog title="Enregistrer un paiement" description={`Reste à payer : ${M(remaining)}`} trigger={<><Plus className="h-4 w-4" /> Paiement</>}
            fields={[
              { name: "amount", label: "Montant", type: "number", required: true, min: "0", defaultValue: remaining },
              { name: "method", label: "Mode de paiement", type: "select", required: true, defaultValue: "especes", options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) },
              { name: "note", label: "Note", full: true },
            ]} hidden={{ invoiceId: i.id }} action={addPaymentAction} />
        )}
        {i.type === "facture" && i.status !== "annulee" && can(ctx.role, "invoices.manage") && !i.saleId && (
          <FormDialog title="Annuler la facture" description="Un avoir est émis, le stock réintégré et les paiements remboursés. L'historique est conservé." triggerClass="btn-outline text-red-600" trigger={<><Ban className="h-4 w-4" /> Annuler (avoir)</>}
            fields={[{ name: "reason", label: "Motif", type: "textarea", required: true }]} hidden={{ id: i.id }} action={cancelInvoiceAction} submitLabel="Émettre l'avoir" danger />
        )}
        {i.saleId && i.status !== "annulee" && <Link href={`/ventes/${i.saleId}`} className="btn-outline">Voir la vente</Link>}
        {i.serviceOrderId && <Link href={`/prestations/${i.serviceOrderId}`} className="btn-outline">Voir la prestation</Link>}
      </PageHeader>
      <DocumentView
        org={ctx.org} settings={ctx.settings} title={i.type === "avoir" ? "Avoir" : "Facture"} reference={i.reference}
        badge={<div className="mt-1">{i.type === "avoir" ? <Badge tone="violet">Avoir</Badge> : <StatusBadge status={i.status} />}{overdue && <> <Badge tone="red">En retard</Badge></>}</div>}
        meta={[{ label: "Émise le", value: fmtDate(i.issueDate) }, ...(i.type === "facture" ? [{ label: "Échéance", value: fmtDate(i.dueDate) }] : [])]}
        customer={cust[0]}
        lines={i.type === "avoir" && items.length === 0 ? [{ description: `Avoir sur facture ${related[0]?.reference ?? ""}`, quantity: 1, unitPrice: i.subtotal }] : items.map((x) => ({ description: x.description, quantity: x.quantity, unitPrice: x.unitPrice, kind: x.kind }))}
        subtotal={i.subtotal} discount={i.discount} taxAmount={i.taxAmount} total={i.total} paid={i.type === "facture" && i.status !== "annulee" ? i.paid : undefined}
        notes={i.status === "annulee" ? `Facture annulée : ${i.cancelReason}` : i.notes}
      >
        {related.length > 0 && <p className="mt-4 text-sm text-slate-600">{i.type === "avoir" ? "Facture d'origine" : "Avoir associé"} : {related.map((r) => <Link key={r.id} href={`/factures/${r.id}`} className="font-medium text-brand-700 underline">{r.reference}</Link>)}</p>}
      </DocumentView>
      {i.type === "facture" && (
        <div className="no-print mx-auto mt-4 max-w-3xl">
          <Card title="Paiements reçus">
            {pays.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun paiement.</p> : (
              <table className="tbl"><thead><tr><th>Reçu</th><th>Date</th><th>Mode</th><th className="text-right">Montant</th></tr></thead><tbody>
                {pays.map((p) => <tr key={p.id}><td><Link className="text-brand-700 hover:underline" href={`/recu/${p.id}`}>{p.reference}</Link></td><td>{fmtDateTime(p.paidAt, tz)}</td><td>{METHOD_LABELS[p.method]}</td><td className={`text-right font-medium ${p.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{M(p.amount)}</td></tr>)}
              </tbody></table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
