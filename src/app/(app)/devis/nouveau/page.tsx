import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { docFormData } from "@/lib/doc-data";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocumentForm } from "@/components/doc-form";
import { saveQuoteAction } from "@/app/actions/ops";

export const metadata = { title: "Nouveau devis" };

export default async function NewQuote() {
  const ctx = await pageCtx("quotes.manage");
  const d = await docFormData(ctx);
  const t = today(ctx.settings.timezone);
  return (
    <>
      <PageHeader title="Nouveau devis"><Link href="/devis" className="btn-outline">← Devis</Link></PageHeader>
      <DocumentForm mode="quote" {...d} canDiscount action={saveQuoteAction} today={t} defaultDue={addDays(t, ctx.settings.quoteValidityDays)} submitLabel="Enregistrer le devis" />
    </>
  );
}
