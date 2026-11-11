import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { FileCheck2, Pencil } from "lucide-react";
import { db } from "@/db";
import { customers, invoices, quoteItems, quotes } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { DocumentView } from "@/components/document-view";
import { ActionButton, PrintButton } from "@/components/client";
import { PageHeader, StatusBadge } from "@/components/ui";
import { quoteConvertAction, quoteStatusAction } from "@/app/actions/ops";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx("quotes.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.organizationId, ctx.org.id)));
  if (!q) notFound();
  const [items, [c], inv] = await Promise.all([
    db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)),
    db.select().from(customers).where(eq(customers.id, q.customerId)),
    q.invoiceId ? db.select().from(invoices).where(eq(invoices.id, q.invoiceId)) : Promise.resolve([]),
  ]);
  const manage = can(ctx.role, "quotes.manage");
  const open = q.status !== "converti";
  return (
    <>
      <PageHeader title={`Devis ${q.reference}`}>
        <Link href="/devis" className="btn-outline">← Devis</Link>
        <PrintButton />
        {manage && open && <Link href={`/devis/${id}/modifier`} className="btn-outline"><Pencil className="h-4 w-4" /> Modifier</Link>}
        {manage && open && q.status !== "envoye" && <ActionButton action={quoteStatusAction} hidden={{ id, status: "envoye" }} className="btn-outline" label="Marquer envoyé" />}
        {manage && open && q.status !== "accepte" && <ActionButton action={quoteStatusAction} hidden={{ id, status: "accepte" }} className="btn-outline" label="Accepté" />}
        {manage && open && q.status !== "refuse" && <ActionButton action={quoteStatusAction} hidden={{ id, status: "refuse" }} className="btn-outline text-red-600" label="Refusé" confirm="Marquer ce devis comme refusé ?" />}
        {open && q.status !== "refuse" && can(ctx.role, "invoices.manage") && <ActionButton action={quoteConvertAction} hidden={{ id }} className="btn-primary" label={<><FileCheck2 className="h-4 w-4" /> Convertir en facture</>} confirm="Convertir en facture ? Le stock des produits sera déduit." />}
        {inv[0] && <Link href={`/factures/${inv[0].id}`} className="btn-outline">Facture {inv[0].reference}</Link>}
      </PageHeader>
      <DocumentView
        org={ctx.org} settings={ctx.settings} title="Devis" reference={q.reference} badge={<div className="mt-1"><StatusBadge status={q.status} /></div>}
        meta={[{ label: "Date", value: fmtDate(q.issueDate) }, { label: "Valable jusqu'au", value: fmtDate(q.validUntil) }]} customer={c}
        lines={items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, kind: i.kind }))}
        subtotal={q.subtotal} discount={q.discount} taxAmount={q.taxAmount} total={q.total} notes={q.notes}
      />
    </>
  );
}
