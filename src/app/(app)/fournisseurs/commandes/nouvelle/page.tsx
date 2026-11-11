import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, suppliers } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { PoForm } from "@/components/po-form";
import { createPOAction } from "@/app/actions/ops";

export const metadata = { title: "Nouvelle commande d'achat" };

export default async function NewPO() {
  const ctx = await pageCtx("suppliers.manage");
  const org = ctx.org.id;
  const [sups, prods] = await Promise.all([
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(and(eq(suppliers.organizationId, org), eq(suppliers.archived, false))).orderBy(asc(suppliers.name)),
    db.select({ id: products.id, name: products.name, sku: products.sku, purchasePrice: products.purchasePrice }).from(products).where(and(eq(products.organizationId, org), eq(products.active, true))).orderBy(asc(products.name)),
  ]);
  return (
    <>
      <PageHeader title="Nouvelle commande d'achat" subtitle="La réception de la commande génère automatiquement les entrées de stock.">
        <Link href="/fournisseurs?tab=commandes" className="btn-outline">← Commandes</Link>
      </PageHeader>
      {sups.length === 0 || prods.length === 0 ? (
        <div className="card p-6 text-sm text-slate-600">Créez d&apos;abord au moins un <Link className="text-brand-700 underline" href="/fournisseurs">fournisseur</Link> et un <Link className="text-brand-700 underline" href="/produits">produit</Link>.</div>
      ) : (
        <PoForm suppliers={sups} products={prods} label={ctx.settings.currencyLabel} today={today(ctx.settings.timezone)} action={createPOAction} />
      )}
    </>
  );
}
