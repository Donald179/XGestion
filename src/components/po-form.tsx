"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/client";

type State = { ok?: boolean; error?: string; message?: string; redirect?: string; token?: number } | null;
type L = { key: number; productId: string; quantity: number; unitCost: number };

export function PoForm({ suppliers, products, label, today, action }: {
  suppliers: { id: string; name: string }[]; products: { id: string; name: string; sku: string; purchasePrice: number }[]; label: string; today: string;
  action: (p: State, fd: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<L[]>([]);
  const [seq, setSeq] = useState(1);
  useEffect(() => {
    if (state?.ok) { toast(state.message ?? "Enregistré"); if (state.redirect) router.push(state.redirect); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const total = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
  const upd = (key: number, p: Partial<L>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const payload = JSON.stringify({ supplierId, orderDate, expectedDate, supplierInvoiceRef: ref, notes, lines: lines.map(({ productId, quantity, unitCost }) => ({ productId, quantity, unitCost })) });
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div><label className="label">Fournisseur *</label><select required className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Sélectionner…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label">N° facture fournisseur</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <div><label className="label">Date de commande</label><input type="date" className="input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required /></div>
        <div><label className="label">Livraison prévue</label><input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
      </div>
      <div className="card">
        <div className="border-b border-slate-100 p-3">
          <select className="input w-auto max-w-full" value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) { setLines((ls) => [...ls, { key: seq, productId: p.id, quantity: 1, unitCost: p.purchasePrice }]); setSeq(seq + 1); } }}>
            <option value="">+ Ajouter un produit…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </div>
        {lines.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-400"><Plus className="mx-auto mb-1 h-5 w-5" />Ajoutez les produits commandés.</p> : (
          <table className="tbl"><thead><tr><th>Produit</th><th className="w-28">Quantité</th><th className="w-36">Coût unitaire</th><th className="text-right">Total</th><th /></tr></thead><tbody>
            {lines.map((l) => (
              <tr key={l.key}><td>{products.find((p) => p.id === l.productId)?.name}</td>
                <td><input type="number" min={1} step={1} className="input" value={l.quantity} onChange={(e) => upd(l.key, { quantity: Math.max(1, Math.floor(Number(e.target.value))) })} /></td>
                <td><input type="number" min={0} step="any" className="input" value={l.unitCost} onChange={(e) => upd(l.key, { unitCost: Math.max(0, Number(e.target.value)) })} /></td>
                <td className="text-right font-medium">{new Intl.NumberFormat("fr-FR").format(l.quantity * l.unitCost)} {label}</td>
                <td><button type="button" aria-label="Retirer" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>
            ))}</tbody></table>
        )}
      </div>
      <div className="card p-4"><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex items-center justify-between"><p className="text-lg font-bold">Total : {new Intl.NumberFormat("fr-FR").format(total)} {label}</p>
        <button disabled={pending || !lines.length} className="btn-primary">{pending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer la commande</button></div>
    </form>
  );
}
