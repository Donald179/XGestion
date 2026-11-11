"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/client";

type State = { ok?: boolean; error?: string; message?: string; redirect?: string; token?: number } | null;
type Line = { key: number; kind: "produit" | "service" | "libre"; productId: string | null; serviceId: string | null; description: string; quantity: number; unitPrice: number };
export type DocInitial = { id?: string; customerId?: string; issueDate?: string; dueDate?: string; notes?: string; discount?: number; lines?: Omit<Line, "key">[] };

const nf = (n: number, label: string, dec = 0) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n).replace(/[\u202f\u00a0]/g, " ")} ${label}`;
const METHODS = [["especes", "Espèces"], ["mobile_money", "Mobile Money"], ["virement", "Virement bancaire"], ["carte", "Carte bancaire"], ["autre", "Autre"]];

export function DocumentForm({ mode, customers, products, services, label, decimals, taxEnabled, taxRate, taxName, canDiscount, action, initial, today, defaultDue, submitLabel }: {
  mode: "sale" | "quote" | "invoice";
  customers: { id: string; name: string }[];
  products: { id: string; name: string; sku: string; salePrice: number; quantity: number }[];
  services: { id: string; name: string; price: number }[];
  label: string; decimals: number; taxEnabled: boolean; taxRate: number; taxName: string; canDiscount: boolean;
  action: (p: State, fd: FormData) => Promise<State>; initial?: DocInitial; today: string; defaultDue: string; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const toast = useToast();
  const [seq, setSeq] = useState(100);
  const [lines, setLines] = useState<Line[]>((initial?.lines ?? []).map((l, i) => ({ ...l, key: i })));
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? defaultDue);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [method, setMethod] = useState("especes");
  const [paid, setPaid] = useState<number | null>(null);

  useEffect(() => {
    if (state?.ok) { toast(state.message ?? "Enregistré"); if (state.redirect) router.push(state.redirect); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const subtotal = useMemo(() => lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0), [lines]);
  const base = Math.max(0, subtotal - discount);
  const tax = taxEnabled ? Math.round(base * taxRate) / 100 : 0;
  const total = Math.round((base + tax) * 100) / 100;
  const effPaid = Math.min(paid ?? total, total);
  const upd = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (l: Omit<Line, "key">) => { setSeq((s) => s + 1); setLines((ls) => [...ls, { ...l, key: seq }]); };

  const payload = JSON.stringify(
    mode === "sale"
      ? { customerId: customerId || null, lines: lines.map(({ productId, quantity, unitPrice, kind, description, serviceId }) => ({ productId, quantity, unitPrice, kind, description, serviceId })), discount, method, paid: effPaid, notes }
      : { id: initial?.id, customerId, issueDate, dueDate: dueDate || null, lines: lines.map(({ key: _k, ...l }) => l), discount, notes },
  );

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-3">
      <input type="hidden" name="payload" value={payload} />
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={mode === "sale" ? "sm:col-span-2" : ""}>
              <label className="label">Client{mode !== "sale" && <span className="text-red-500"> *</span>}</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input" required={mode !== "sale"}>
                <option value="">{mode === "sale" ? "Client de passage (comptoir)" : "Sélectionner un client…"}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {mode !== "sale" && (
              <>
                <div><label className="label">Date d&apos;émission</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="input" required /></div>
                <div><label className="label">{mode === "quote" ? "Valide jusqu'au" : "Date d'échéance"}</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" /></div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <select className="input w-auto max-w-full" value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) add({ kind: "produit", productId: p.id, serviceId: null, description: p.name, quantity: 1, unitPrice: p.salePrice }); }}>
              <option value="">+ Ajouter un produit…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {nf(p.salePrice, label, decimals)} (stock {p.quantity})</option>)}
            </select>
            {mode !== "sale" && (
              <>
                <select className="input w-auto max-w-full" value="" onChange={(e) => { const sv = services.find((x) => x.id === e.target.value); if (sv) add({ kind: "service", productId: null, serviceId: sv.id, description: sv.name, quantity: 1, unitPrice: sv.price }); }}>
                  <option value="">+ Ajouter une prestation…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {nf(s.price, label, decimals)}</option>)}
                </select>
                <button type="button" className="btn-outline btn-sm" onClick={() => add({ kind: "libre", productId: null, serviceId: null, description: "", quantity: 1, unitPrice: 0 })}><Plus className="h-3.5 w-3.5" /> Ligne libre</button>
              </>
            )}
          </div>
          {lines.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-400">Aucune ligne. Ajoutez des {mode === "sale" ? "produits" : "produits ou prestations"}.</p> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Désignation</th><th className="w-24">Qté</th><th className="w-36">Prix unitaire</th><th className="w-32 text-right">Total</th><th /></tr></thead>
                <tbody>
                  {lines.map((l) => {
                    const p = l.productId ? products.find((x) => x.id === l.productId) : null;
                    const low = mode === "sale" && p && l.quantity > p.quantity;
                    return (
                      <tr key={l.key}>
                        <td>
                          {l.kind === "produit" ? <span className="font-medium">{l.description}</span> : <input className="input" placeholder="Description" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} />}
                          <span className="ml-1 text-[11px] uppercase text-slate-400">{l.kind === "produit" ? "Produit" : l.kind === "service" ? "Prestation" : ""}</span>
                          {low && <p className="text-xs text-orange-600">Stock disponible : {p!.quantity}</p>}
                        </td>
                        <td><input type="number" min={1} step={1} className="input" value={l.quantity} onChange={(e) => upd(l.key, { quantity: Math.max(0, Math.floor(Number(e.target.value))) })} aria-label="Quantité" /></td>
                        <td><input type="number" min={0} step="any" className="input" value={l.unitPrice} disabled={mode === "sale" && !canDiscount} onChange={(e) => upd(l.key, { unitPrice: Math.max(0, Number(e.target.value)) })} aria-label="Prix unitaire" /></td>
                        <td className="text-right font-medium">{nf(l.quantity * l.unitPrice, label, decimals)}</td>
                        <td><button type="button" aria-label="Retirer la ligne" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-4"><label className="label">Notes {mode === "sale" ? "" : "(visibles sur le document)"}</label><textarea rows={2} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>

      <div className="space-y-4">
        <div className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold">Récapitulatif</h3>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Sous-total</span><span>{nf(subtotal, label, decimals)}</span></div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-500">Remise</span>
            <input type="number" min={0} step="any" className="input w-32 text-right" value={discount} disabled={mode === "sale" && !canDiscount} title={mode === "sale" && !canDiscount ? "Remise non autorisée pour votre rôle" : ""} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} aria-label="Remise" />
          </div>
          {taxEnabled && <div className="flex justify-between text-sm"><span className="text-slate-500">{taxName} ({taxRate}%)</span><span>{nf(tax, label, decimals)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold"><span>Total{taxEnabled ? " TTC" : ""}</span><span>{nf(total, label, decimals)}</span></div>
          {discount > subtotal && <p className="text-xs text-red-600">La remise dépasse le sous-total.</p>}
        </div>

        {mode === "sale" && (
          <div className="card space-y-3 p-4">
            <h3 className="text-sm font-semibold">Paiement</h3>
            <div><label className="label">Mode de paiement</label><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className="label">Montant encaissé</label><input type="number" min={0} max={total} step="any" className="input" value={effPaid} onChange={(e) => setPaid(Math.max(0, Number(e.target.value)))} /></div>
            <div className="flex gap-2">
              <button type="button" className="btn-outline btn-sm flex-1" onClick={() => setPaid(null)}>Payée</button>
              <button type="button" className="btn-outline btn-sm flex-1" onClick={() => setPaid(Math.round(total / 2))}>50 %</button>
              <button type="button" className="btn-outline btn-sm flex-1" onClick={() => setPaid(0)}>Non payée</button>
            </div>
            <p className="text-xs text-slate-500">Reste à payer : <b className={total - effPaid > 0 ? "text-red-600" : "text-emerald-600"}>{nf(total - effPaid, label, decimals)}</b></p>
          </div>
        )}
        {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button type="submit" disabled={pending || lines.length === 0} className="btn-primary w-full py-2.5">{pending && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}</button>
      </div>
    </form>
  );
}
