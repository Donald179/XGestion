import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Ban, FileText, Plus } from "lucide-react";
import { db } from "@/db";
import { customers, invoices, payments, saleItems, sales } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDateTime, fmtMoney, METHOD_LABELS } from "@/lib/format";
import { DocumentView } from "@/components/document-view";
import { ActionButton, FormDialog, PrintButton } from "@/components/client";
import { Card, PageHeader, StatusBadge, payState } from "@/components/ui";
import { addPaymentAction, cancelSaleAction, saleInvoiceAction } from "@/app/actions/ops";

export default async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx("sales.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s] = await db.select().from(sales).where(and(eq(sales.id, id), eq(sales.organizationId, ctx.org.id)));
  if (!s) notFound();
  const [items, pays, [cust], [inv]] = await Promise.all([
    db.select().from(saleItems).where(eq(saleItems.saleId, id)),
    db.select().from(payments).where(and(eq(payments.organizationId, ctx.org.id), eq(payments.saleId, id))).orderBy(asc(payments.paidAt)),
    s.customerId ? db.select().from(customers).where(eq(customers.id, s.customerId)) : Promise.resolve([]),
    s.invoiceId ? db.select().from(invoices).where(eq(invoices.id, s.invoiceId)) : Promise.resolve([]),
  ]);
  const remaining = s.total - s.paid;
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const tz = ctx.settings.timezone;
  return (
    <>
      <PageHeader title={`Vente ${s.reference}`} subtitle={fmtDateTime(s.createdAt, tz)}>
        <Link href="/ventes" className="btn-outline">← Ventes</Link>
        <PrintButton label="Imprimer le reçu / PDF" />
        {s.status === "validee" && remaining > 0 && can(ctx.role, "payments.create") && (
          <FormDialog title="Encaisser un paiement" description={`Reste à payer : ${M(remaining)}`} trigger={<><Plus className="h-4 w-4" /> Encaisser</>}
            fields={[
              { name: "amount", label: "Montant", type: "number", required: true, min: "0", defaultValue: remaining },
              { name: "method", label: "Mode de paiement", type: "select", required: true, defaultValue: "especes", options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) },
              { name: "note", label: "Note", full: true },
            ]} hidden={{ saleId: s.id }} action={addPaymentAction} />
        )}
        {s.status === "validee" && !s.invoiceId && can(ctx.role, "invoices.manage") && <ActionButton action={saleInvoiceAction} hidden={{ id: s.id }} className="btn-outline" label={<><FileText className="h-4 w-4" /> Générer la facture</>} confirm="Générer une facture à partir de cette vente ?" />}
        {inv && <Link href={`/factures/${inv.id}`} className="btn-outline">Facture {inv.reference}</Link>}
        {s.status === "validee" && can(ctx.role, "sales.cancel") && (
          <FormDialog title="Annuler la vente" description="Le stock est réintégré et les paiements remboursés. Action tracée dans le journal." triggerClass="btn-outline text-red-600" trigger={<><Ban className="h-4 w-4" /> Annuler</>}
            fields={[{ name: "reason", label: "Motif de l'annulation", type: "textarea", required: true }]} hidden={{ id: s.id }} action={cancelSaleAction} submitLabel="Confirmer l'annulation" danger />
        )}
      </PageHeader>
      <DocumentView
        org={ctx.org} settings={ctx.settings} title="Reçu de vente" reference={s.reference}
        badge={<div className="mt-1">{s.status === "annulee" ? <StatusBadge status="annulee" /> : <StatusBadge status={payState(s.total, s.paid)} />}</div>}
        meta={[{ label: "Date", value: fmtDateTime(s.createdAt, tz) }]} customer={cust}
        lines={items.map((i) => ({ description: i.name, quantity: i.quantity, unitPrice: i.unitPrice }))}
        subtotal={s.subtotal} discount={s.discount} taxAmount={s.taxAmount} total={s.total} paid={s.paid} notes={s.notes}
      />
      <div className="no-print mx-auto mt-4 max-w-3xl">
        <Card title="Paiements">
          {pays.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun paiement enregistré.</p> : (
            <table className="tbl"><thead><tr><th>Reçu</th><th>Date</th><th>Mode</th><th className="text-right">Montant</th></tr></thead><tbody>
              {pays.map((p) => <tr key={p.id}><td><Link className="text-brand-700 hover:underline" href={`/recu/${p.id}`}>{p.reference}</Link></td><td>{fmtDateTime(p.paidAt, tz)}</td><td>{METHOD_LABELS[p.method]}</td><td className={`text-right font-medium ${p.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{M(p.amount)}</td></tr>)}
            </tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
