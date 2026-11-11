import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { docFormData } from "@/lib/doc-data";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocumentForm } from "@/components/doc-form";
import { createInvoiceAction } from "@/app/actions/ops";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoice() {
  const ctx = await pageCtx("invoices.manage");
  const d = await docFormData(ctx);
  const t = today(ctx.settings.timezone);
  return (
    <>
      <PageHeader title="Nouvelle facture" subtitle="Combinez produits et prestations. Le stock des produits est déduit à l'émission.">
        <Link href="/factures" className="btn-outline">← Factures</Link>
      </PageHeader>
      <DocumentForm mode="invoice" {...d} canDiscount action={createInvoiceAction} today={t} defaultDue={addDays(t, ctx.settings.paymentTermsDays)} submitLabel="Émettre la facture" />
    </>
  );
}
