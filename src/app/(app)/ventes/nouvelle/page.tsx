import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { docFormData } from "@/lib/doc-data";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocumentForm } from "@/components/doc-form";
import { createSaleAction } from "@/app/actions/ops";

export const metadata = { title: "Nouvelle vente" };

export default async function NewSale() {
  const ctx = await pageCtx("sales.create");
  const d = await docFormData(ctx);
  return (
    <>
      <PageHeader title="Nouvelle vente" subtitle="Le stock est déduit et le paiement enregistré à la validation.">
        <Link href="/ventes" className="btn-outline">← Ventes</Link>
      </PageHeader>
      <DocumentForm mode="sale" {...d} canDiscount={can(ctx.role, "sales.discount")} action={createSaleAction} today={today(ctx.settings.timezone)} defaultDue="" submitLabel="Valider la vente" />
    </>
  );
}
