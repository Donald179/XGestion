import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { quoteItems, quotes } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { docFormData } from "@/lib/doc-data";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocumentForm } from "@/components/doc-form";
import { saveQuoteAction } from "@/app/actions/ops";

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx("quotes.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.organizationId, ctx.org.id)));
  if (!q) notFound();
  if (q.status === "converti") redirect(`/devis/${id}`);
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
  const d = await docFormData(ctx);
  return (
    <>
      <PageHeader title={`Modifier ${q.reference}`}><Link href={`/devis/${id}`} className="btn-outline">← Retour</Link></PageHeader>
      <DocumentForm
        mode="quote" {...d} canDiscount action={saveQuoteAction} today={today(ctx.settings.timezone)} defaultDue="" submitLabel="Enregistrer les modifications"
        initial={{ id: q.id, customerId: q.customerId, issueDate: q.issueDate, dueDate: q.validUntil ?? "", notes: q.notes ?? "", discount: q.discount,
          lines: items.map((i) => ({ kind: i.kind as "produit" | "service" | "libre", productId: i.productId, serviceId: i.serviceId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) }}
      />
    </>
  );
}
