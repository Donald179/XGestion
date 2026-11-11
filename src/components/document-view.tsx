import type { ReactNode } from "react";
import type { Org, Settings } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";

export type DocLineView = { description: string; quantity: number; unitPrice: number; kind?: string };

/** Document imprimable (facture, devis, reçu) : « Imprimer / PDF » via le navigateur. */
export function DocumentView({ org, settings, title, reference, meta, customer, lines, subtotal, discount, taxAmount, total, paid, notes, badge, children }: {
  org: Org; settings: Settings; title: string; reference: string; meta: { label: string; value: string }[];
  customer?: { name: string; phone?: string | null; email?: string | null; address?: string | null } | null;
  lines: DocLineView[]; subtotal: number; discount: number; taxAmount: number; total: number; paid?: number; notes?: string | null; badge?: ReactNode; children?: ReactNode;
}) {
  const M = (n: number) => fmtMoney(n, settings);
  return (
    <article className="print-area mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {org.logoUrl && <img src={org.logoUrl} alt="" className="h-14 w-14 rounded object-contain" />}
          <div className="text-sm text-slate-600">
            <p className="text-lg font-bold text-slate-900">{org.name}</p>
            {org.address && <p>{org.address}</p>}
            {org.phone && <p>Tél : {org.phone}</p>}
            {org.email && <p>{org.email}</p>}
            {org.taxId && <p>N° fiscal : {org.taxId}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-wide text-brand-700">{title}</p>
          <p className="font-mono text-sm font-semibold">{reference}</p>
          {badge}
        </div>
      </header>
      <section className="grid gap-4 py-5 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Client</p>
          {customer ? (
            <div className="text-slate-700"><p className="font-semibold text-slate-900">{customer.name}</p>{customer.address && <p>{customer.address}</p>}{customer.phone && <p>{customer.phone}</p>}{customer.email && <p>{customer.email}</p>}</div>
          ) : <p className="text-slate-700">Client de passage</p>}
        </div>
        <dl className="space-y-1 sm:text-right">
          {meta.map((m) => <div key={m.label}><dt className="inline text-slate-400">{m.label} : </dt><dd className="inline font-medium text-slate-800">{m.value}</dd></div>)}
        </dl>
      </section>
      <table className="tbl">
        <thead><tr><th>Désignation</th><th className="text-right">Qté</th><th className="text-right">Prix unitaire</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}><td>{l.description}{l.kind === "service" && <span className="ml-1 text-[11px] text-slate-400">(prestation)</span>}</td><td className="text-right">{l.quantity}</td><td className="text-right">{M(l.unitPrice)}</td><td className="text-right font-medium">{M(l.quantity * l.unitPrice)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span>{M(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Remise</span><span>− {M(discount)}</span></div>}
        {settings.taxEnabled && <div className="flex justify-between"><span className="text-slate-500">{settings.taxName} ({settings.taxRate}%)</span><span>{M(taxAmount)}</span></div>}
        <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>{settings.taxEnabled ? "Total TTC" : "Total"}</span><span>{M(total)}</span></div>
        {paid !== undefined && (
          <>
            <div className="flex justify-between text-emerald-700"><span>Montant payé</span><span>{M(paid)}</span></div>
            <div className={`flex justify-between font-semibold ${total - paid > 0.005 ? "text-red-600" : "text-emerald-700"}`}><span>Reste à payer</span><span>{M(Math.max(0, total - paid))}</span></div>
          </>
        )}
      </div>
      {notes && <p className="mt-6 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-600">{notes}</p>}
      {children}
      {settings.invoiceFooter && <p className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">{settings.invoiceFooter}</p>}
    </article>
  );
}
