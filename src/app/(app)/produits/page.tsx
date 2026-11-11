import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/db";
import { categories, products, suppliers } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtNum } from "@/lib/format";
import { ActionButton, Filters, FormDialog, type Field } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, Tabs, likeOf, pageOf } from "@/components/ui";
import { deleteCategoryAction, saveCategoryAction, saveProductAction, toggleProductAction } from "@/app/actions/crm";

export const metadata = { title: "Produits" };

type SP = { tab?: string; q?: string; cat?: string; status?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageCtx("products.view");
  const sp = await searchParams;
  const org = ctx.org.id;
  const manage = can(ctx.role, "products.manage");
  const tab = sp.tab === "categories" ? "categories" : "produits";
  const [cats, sups] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.organizationId, org), eq(categories.archived, false))).orderBy(asc(categories.name)),
    db.select().from(suppliers).where(and(eq(suppliers.organizationId, org), eq(suppliers.archived, false))).orderBy(asc(suppliers.name)),
  ]);
  const M = (n: number) => fmtMoney(n, ctx.settings);

  const fields = (p?: typeof products.$inferSelect): Field[] => [
    { name: "name", label: "Nom du produit", required: true, defaultValue: p?.name, full: true },
    { name: "sku", label: "Référence SKU", required: true, defaultValue: p?.sku },
    { name: "barcode", label: "Code-barres (facultatif)", defaultValue: p?.barcode },
    { name: "categoryId", label: "Catégorie", type: "select", defaultValue: p?.categoryId, options: cats.map((c) => ({ value: c.id, label: c.name })) },
    { name: "supplierId", label: "Fournisseur", type: "select", defaultValue: p?.supplierId, options: sups.map((c) => ({ value: c.id, label: c.name })) },
    { name: "purchasePrice", label: `Prix d'achat (${ctx.settings.currencyLabel})`, type: "number", min: "0", required: true, defaultValue: p?.purchasePrice ?? 0 },
    { name: "salePrice", label: `Prix de vente (${ctx.settings.currencyLabel})`, type: "number", min: "0", required: true, defaultValue: p?.salePrice ?? 0 },
    ...(p ? [] : [{ name: "initialStock", label: "Stock initial", type: "number" as const, step: "1", min: "0", defaultValue: 0 }]),
    { name: "alertThreshold", label: "Seuil d'alerte", type: "number", step: "1", min: "0", required: true, defaultValue: p?.alertThreshold ?? 5 },
    { name: "description", label: "Description", type: "textarea", defaultValue: p?.description },
    { name: "imageUrl", label: "Image du produit", type: "file", defaultValue: p?.imageUrl, full: true },
    ...(p ? [{ name: "active", label: "Produit actif", type: "checkbox" as const, defaultValue: p.active }] : []),
  ];

  if (tab === "categories") {
    const counts = await db.select({ id: products.categoryId, n: sql<number>`count(*)::int` }).from(products).where(eq(products.organizationId, org)).groupBy(products.categoryId);
    return (
      <>
        <PageHeader title="Produits" subtitle="Catalogue, prix et catégories">
          {manage && <FormDialog title="Nouvelle catégorie" trigger={<><Plus className="h-4 w-4" /> Nouvelle catégorie</>} fields={[{ name: "name", label: "Nom", required: true, full: true }]} action={saveCategoryAction} />}
        </PageHeader>
        <Tabs current={tab} items={[{ key: "produits", label: "Produits" }, { key: "categories", label: "Catégories" }]} />
        <Card>
          {cats.length === 0 ? <Empty text="Aucune catégorie." /> : (
            <table className="tbl"><thead><tr><th>Catégorie</th><th>Produits</th><th /></tr></thead><tbody>
              {cats.map((c) => (
                <tr key={c.id}><td className="font-medium">{c.name}</td><td>{counts.find((x) => x.id === c.id)?.n ?? 0}</td>
                  <td className="flex justify-end gap-2">
                    {manage && <FormDialog title="Renommer la catégorie" triggerClass="btn-outline btn-sm" trigger={<Pencil className="h-3.5 w-3.5" />} fields={[{ name: "name", label: "Nom", required: true, defaultValue: c.name, full: true }]} hidden={{ id: c.id }} action={saveCategoryAction} />}
                    {manage && <ActionButton action={deleteCategoryAction} hidden={{ id: c.id }} confirm="Supprimer cette catégorie ? (archivée si des produits l'utilisent)" label={<Trash2 className="h-3.5 w-3.5" />} className="btn-outline btn-sm text-red-600" />}
                  </td></tr>
              ))}
            </tbody></table>
          )}
        </Card>
      </>
    );
  }

  const page = pageOf(sp.page);
  const where = and(
    eq(products.organizationId, org),
    sp.status === "archive" ? eq(products.active, false) : eq(products.active, true),
    sp.status === "low" ? sql`${products.quantity} <= ${products.alertThreshold}` : undefined,
    sp.cat ? eq(products.categoryId, sp.cat) : undefined,
    sp.q ? or(ilike(products.name, likeOf(sp.q)), ilike(products.sku, likeOf(sp.q)), ilike(products.barcode, likeOf(sp.q))) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(asc(products.name)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(where),
  ]);
  return (
    <>
      <PageHeader title="Produits" subtitle="Catalogue, prix et catégories">
        {manage && <FormDialog title="Nouveau produit" trigger={<><Plus className="h-4 w-4" /> Nouveau produit</>} fields={fields()} action={saveProductAction} />}
      </PageHeader>
      <Tabs current={tab} items={[{ key: "produits", label: "Produits" }, { key: "categories", label: "Catégories" }]} />
      <Card>
        <div className="border-b border-slate-100 p-3">
          <Filters placeholder="Nom, SKU, code-barres…" selects={[
            { name: "cat", label: "Toutes catégories", options: cats.map((c) => ({ value: c.id, label: c.name })) },
            { name: "status", label: "Produits actifs", options: [{ value: "low", label: "Stock faible / épuisé" }, { value: "archive", label: "Produits archivés" }] },
          ]} />
        </div>
        {rows.length === 0 ? <Empty text="Aucun produit." /> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Produit</th><th>SKU</th><th>Catégorie</th><th className="text-right">Prix d&apos;achat</th><th className="text-right">Prix de vente</th><th className="text-right">Stock</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><div className="flex items-center gap-2">
                    {p.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-slate-100" />}
                    <span className="font-medium text-slate-900">{p.name}</span></div></td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>{cats.find((c) => c.id === p.categoryId)?.name ?? "—"}</td>
                  <td className="text-right">{M(p.purchasePrice)}</td><td className="text-right font-medium">{M(p.salePrice)}</td>
                  <td className="text-right"><Badge tone={p.quantity <= 0 ? "red" : p.quantity <= p.alertThreshold ? "orange" : "green"}>{fmtNum(p.quantity)}</Badge></td>
                  <td><div className="flex justify-end gap-2">
                    {manage && <FormDialog title="Modifier le produit" triggerClass="btn-outline btn-sm" trigger={<Pencil className="h-3.5 w-3.5" />} fields={fields(p)} hidden={{ id: p.id, hasActive: "1" }} action={saveProductAction} />}
                    {manage && <ActionButton action={toggleProductAction} hidden={{ id: p.id, active: p.active ? "0" : "1" }} confirm={p.active ? "Archiver ce produit ?" : undefined} label={p.active ? "Archiver" : "Réactiver"} />}
                  </div></td>
                </tr>
              ))}
            </tbody></table></div>
        )}
        <Pager page={page} total={n} params={{ ...sp, tab: undefined }} />
      </Card>
    </>
  );
}
