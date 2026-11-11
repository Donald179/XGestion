import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, payments, sales } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can, homeFor } from "@/lib/permissions";
import { fmtDateTime, fmtMoney, METHOD_LABELS } from "@/lib/format";
import { PrintButton } from "@/components/client";
import { PageHeader } from "@/components/ui";

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCtx();
  if (!["sales.view", "invoices.view", "finance.view"].some((p) => can(ctx.role, p))) redirect(homeFor(ctx.role));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.organizationId, ctx.org.id)));
  if (!p) notFound();
  const [[c], [inv], [sale]] = await Promise.all([
    p.customerId ? db.select().from(customers).where(eq(customers.id, p.customerId)) : Promise.resolve([]),
    p.invoiceId ? db.select().from(invoices).where(eq(invoices.id, p.invoiceId)) : Promise.resolve([]),
    p.saleId ? db.select().from(sales).where(eq(sales.id, p.saleId)) : Promise.resolve([]),
  ]);
  const doc = inv?.reference ?? sale?.reference ?? p.label ?? "Recette diverse";
  return (
    <>
      <PageHeader title={`Reçu ${p.reference}`}><Link href="/finances" className="btn-outline">← Retour</Link><PrintButton /></PageHeader>
      <article className="print-area mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-sm shadow-sm">
        <div className="text-center">
          <p className="text-lg font-bold">{ctx.org.name}</p>
          {ctx.org.address && <p className="text-slate-500">{ctx.org.address}</p>}
          {ctx.org.phone && <p className="text-slate-500">{ctx.org.phone}</p>}
          <p className="mt-4 text-xl font-bold uppercase text-brand-700">{p.amount < 0 ? "Remboursement" : "Reçu de paiement"}</p>
          <p className="font-mono">{p.reference}</p>
        </div>
        <dl className="mt-6 space-y-2">
          <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd>{fmtDateTime(p.paidAt, ctx.settings.timezone)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Client</dt><dd>{c?.name ?? "Client de passage"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Document</dt><dd>{doc}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Mode de paiement</dt><dd>{METHOD_LABELS[p.method]}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><dt>Montant</dt><dd className={p.amount < 0 ? "text-red-600" : "text-emerald-700"}>{fmtMoney(p.amount, ctx.settings)}</dd></div>
        </dl>
        {p.note && <p className="mt-4 text-slate-500">{p.note}</p>}
        <p className="mt-8 text-center text-xs text-slate-400">Merci de votre confiance.</p>
      </article>
    </>
  );
}
