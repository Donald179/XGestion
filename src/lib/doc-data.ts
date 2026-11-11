import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, services } from "@/db/schema";
import type { Ctx } from "@/lib/auth";

export async function docFormData(ctx: Ctx) {
  const org = ctx.org.id;
  const [cs, ps, ss] = await Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers).where(and(eq(customers.organizationId, org), eq(customers.archived, false))).orderBy(asc(customers.name)),
    db.select({ id: products.id, name: products.name, sku: products.sku, salePrice: products.salePrice, quantity: products.quantity }).from(products).where(and(eq(products.organizationId, org), eq(products.active, true))).orderBy(asc(products.name)),
    db.select({ id: services.id, name: services.name, price: services.price }).from(services).where(and(eq(services.organizationId, org), eq(services.active, true))).orderBy(asc(services.name)),
  ]);
  const st = ctx.settings;
  return {
    customers: cs, products: ps, services: ss,
    label: st.currencyLabel, decimals: ["XOF", "XAF", "JPY", "GNF", "KMF", "RWF"].includes(st.currency) ? 0 : 2,
    taxEnabled: st.taxEnabled, taxRate: st.taxRate, taxName: st.taxName,
  };
}
