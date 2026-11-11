import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { ArrowLeftRight, ClipboardCheck, Plus } from "lucide-react";
import { db } from "@/db";
import { products, profiles, stockLocations, stockMovements } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { Filters, FormDialog } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, Tabs, likeOf, pageOf } from "@/components/ui";
import { inventoryAction, stockMovementAction } from "@/app/actions/ops";
import { saveLocationAction } from "@/app/actions/crm";

export const metadata = { title: "Stocks" };
const TYPES: Record<string, string> = { entree: "Entrée", sortie: "Sortie", vente: "Vente", retour: "Retour", ajustement: "Ajustement", perte: "Perte", transfert: "Transfert" };
const TONE: Record<string, string> = { entree: "green", retour: "green", vente: "blue", sortie: "orange", perte: "red", ajustement: "violet", transfert: "gray" };

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; type?: string; status?: string; page?: string }> }) {
  const ctx = await pageCtx("stock.view");
  const sp = await searchParams;
  const org = ctx.org.id;
  const manage = can(ctx.role, "stock.manage");
  const tab = ["mouvements", "emplacements"].includes(sp.tab ?? "") ? sp.tab! : "niveaux";
  const page = pageOf(sp.page);
  const [prods, locs] = await Promise.all([
    db.select({ id: products.id, name: products.name, sku: products.sku }).from(products).where(and(eq(products.organizationId, org), eq(products.active, true))).orderBy(asc(products.name)),
    db.select().from(stockLocations).where(eq(stockLocations.organizationId, org)).orderBy(desc(stockLocations.isDefault), asc(stockLocations.name)),
  ]);
  const prodOpts = prods.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }));
  const locOpts = locs.map((l) => ({ value: l.id, label: l.name }));
  const tabs = [{ key: "niveaux", label: "Niveaux de stock" }, { key: "mouvements", label: "Historique des mouvements" }, { key: "emplacements", label: "Emplacements" }];
  const header = (
    <PageHeader title="Stocks" subtitle="Niveaux, mouvements et inventaire physique">
      {manage && (
        <FormDialog title="Nouveau mouvement de stock" description="Les ventes et réceptions fournisseurs génèrent leurs mouvements automatiquement." trigger={<><Plus className="h-4 w-4" /> Mouvement</>}
          fields={[
            { name: "productId", label: "Produit", type: "select", required: true, options: prodOpts, full: true },
            { name: "type", label: "Type de mouvement", type: "select", required: true, defaultValue: "entree", options: [
              { value: "entree", label: "Entrée (réapprovisionnement)" }, { value: "sortie", label: "Sortie" }, { value: "retour", label: "Retour client (réintégration)" },
              { value: "perte", label: "Perte / casse" }, { value: "ajustement", label: "Ajustement (+/−)" }, { value: "transfert", label: "Transfert entre emplacements" }] },
            { name: "quantity", label: "Quantité", type: "number", step: "1", required: true, hint: "Ajustement : valeur négative pour retirer." },
            { name: "locationId", label: "Emplacement (source)", type: "select", options: locOpts },
            { name: "toLocationId", label: "Destination (transfert)", type: "select", options: locOpts },
            { name: "reason", label: "Motif", full: true },
          ]}
          action={stockMovementAction} />
      )}
    </PageHeader>
  );

  if (tab === "emplacements") {
    const lv = await db.select({ loc: stockMovements.locationId, n: sql<number>`coalesce(sum(${stockMovements.quantity}),0)::int` }).from(stockMovements).where(eq(stockMovements.organizationId, org)).groupBy(stockMovements.locationId);
    return (
      <>
        {header}<Tabs current={tab} items={tabs} />
        <Card title="Emplacements de stock" actions={manage ? <FormDialog title="Nouvel emplacement" triggerClass="btn-outline btn-sm" trigger="Ajouter" fields={[{ name: "name", label: "Nom", required: true, full: true }]} action={saveLocationAction} /> : undefined}>
          <table className="tbl"><thead><tr><th>Emplacement</th><th className="text-right">Unités en stock</th></tr></thead><tbody>
            {locs.map((l) => <tr key={l.id}><td className="font-medium">{l.name} {l.isDefault && <Badge tone="blue">Par défaut</Badge>}</td><td className="text-right">{fmtNum(lv.find((x) => x.loc === l.id)?.n ?? 0)}</td></tr>)}
          </tbody></table>
        </Card>
      </>
    );
  }

  if (tab === "mouvements") {
    const where = and(eq(stockMovements.organizationId, org), sp.type ? eq(stockMovements.type, sp.type) : undefined, sp.q ? or(ilike(products.name, likeOf(sp.q)), ilike(stockMovements.reference, likeOf(sp.q))) : undefined);
    const [rows, [{ n }]] = await Promise.all([
      db.select({ m: stockMovements, pname: products.name, sku: products.sku, loc: stockLocations.name, who: profiles.fullName })
        .from(stockMovements).innerJoin(products, eq(products.id, stockMovements.productId)).leftJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId)).leftJoin(profiles, eq(profiles.id, stockMovements.userId))
        .where(where).orderBy(desc(stockMovements.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
      db.select({ n: sql<number>`count(*)::int` }).from(stockMovements).innerJoin(products, eq(products.id, stockMovements.productId)).where(where),
    ]);
    return (
      <>
        {header}<Tabs current={tab} items={tabs} />
        <Card>
          <div className="border-b border-slate-100 p-3"><Filters placeholder="Produit ou référence…" selects={[{ name: "type", label: "Tous les types", options: Object.entries(TYPES).map(([value, label]) => ({ value, label })) }]} /></div>
          {rows.length === 0 ? <Empty text="Aucun mouvement enregistré." /> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Produit</th><th>Type</th><th className="text-right">Qté</th><th className="text-right">Solde</th><th>Emplacement</th><th>Motif</th><th>Référence</th><th>Utilisateur</th></tr></thead><tbody>
              {rows.map(({ m, pname, loc, who }) => (
                <tr key={m.id}><td className="whitespace-nowrap">{fmtDateTime(m.createdAt, ctx.settings.timezone)}</td><td className="font-medium">{pname}</td><td><Badge tone={TONE[m.type]}>{TYPES[m.type] ?? m.type}</Badge></td>
                  <td className={`text-right font-semibold ${m.quantity < 0 ? "text-red-600" : "text-emerald-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td><td className="text-right">{m.balanceAfter}</td>
                  <td>{loc ?? "—"}</td><td className="max-w-[220px] truncate">{m.reason ?? "—"}</td><td className="font-mono text-xs">{m.reference ?? "—"}</td><td>{who ?? "—"}</td></tr>
              ))}</tbody></table></div>
          )}
          <Pager page={page} total={n} params={sp} />
        </Card>
      </>
    );
  }

  const where = and(eq(products.organizationId, org), eq(products.active, true), sp.status === "low" ? sql`${products.quantity} <= ${products.alertThreshold}` : undefined, sp.q ? or(ilike(products.name, likeOf(sp.q)), ilike(products.sku, likeOf(sp.q))) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(asc(products.name)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(where),
  ]);
  return (
    <>
      {header}<Tabs current={tab} items={tabs} />
      <Card>
        <div className="border-b border-slate-100 p-3"><Filters placeholder="Produit ou SKU…" selects={[{ name: "status", label: "Tous les niveaux", options: [{ value: "low", label: "Stock faible / épuisé" }] }]} /></div>
        {rows.length === 0 ? <Empty text="Aucun produit en stock." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Produit</th><th>SKU</th><th className="text-right">Quantité</th><th className="text-right">Seuil</th><th>État</th><th /></tr></thead><tbody>
            {rows.map((p) => (
              <tr key={p.id}><td className="font-medium">{p.name}</td><td className="font-mono text-xs">{p.sku}</td><td className="text-right font-semibold">{fmtNum(p.quantity)}</td><td className="text-right">{p.alertThreshold}</td>
                <td>{p.quantity <= 0 ? <Badge tone="red">Épuisé</Badge> : p.quantity <= p.alertThreshold ? <Badge tone="orange">Stock faible</Badge> : <Badge tone="green">OK</Badge>}</td>
                <td className="text-right">{manage && <FormDialog title={`Inventaire : ${p.name}`} description={`Quantité théorique : ${p.quantity}. Saisissez la quantité comptée : l'écart sera enregistré comme ajustement.`} triggerClass="btn-outline btn-sm" trigger={<><ClipboardCheck className="h-3.5 w-3.5" /> Inventaire</>}
                  fields={[{ name: "counted", label: "Quantité comptée", type: "number", step: "1", min: "0", required: true, defaultValue: p.quantity, full: true }]} hidden={{ productId: p.id }} action={inventoryAction} submitLabel="Ajuster le stock" />}</td></tr>
            ))}</tbody></table></div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
      <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><ArrowLeftRight className="h-3.5 w-3.5" /> Les ventes sont refusées si le stock est insuffisant, sauf si le propriétaire autorise le stock négatif dans les paramètres.</p>
    </>
  );
}
