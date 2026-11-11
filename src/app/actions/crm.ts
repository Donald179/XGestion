"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { run, str, optStr, numOf, bool, type ActionState } from "@/lib/action";
import { actCtx, UserError } from "@/lib/auth";
import { audit, moveStock } from "@/lib/biz";

type OwnTable = typeof s.categories | typeof s.suppliers | typeof s.customers | typeof s.services | typeof s.products | typeof s.stockLocations;
async function own(t: OwnTable, id: string | null, orgId: string, label: string) {
  if (!id) return;
  const [r] = await db.select({ id: t.id }).from(t as typeof s.categories).where(and(eq(t.id, id), eq(t.organizationId, orgId)));
  if (!r) throw new UserError(`${label} introuvable.`);
}
const email = (v: string | null) => {
  if (v) z.string().email("Adresse email invalide.").parse(v);
  return v;
};
const dataUrl = (v: string | null) => {
  if (v && !v.startsWith("data:") && !/^https?:\/\//.test(v)) throw new UserError("Pièce jointe invalide.");
  if (v && v.length > 900_000) throw new UserError("Fichier trop volumineux.");
  return v;
};

/* ───── Clients ───── */
export async function saveCustomerAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("customers.manage");
    const id = str(fd, "id");
    const v = {
      name: z.string().min(2, "Nom requis (2 caractères min.).").parse(str(fd, "name")),
      type: str(fd, "type") === "entreprise" ? "entreprise" : "particulier",
      phone: optStr(fd, "phone"), email: email(optStr(fd, "email")), address: optStr(fd, "address"), notes: optStr(fd, "notes"),
    };
    if (id) {
      const r = await db.update(s.customers).set(v).where(and(eq(s.customers.id, id), eq(s.customers.organizationId, ctx.org.id))).returning({ id: s.customers.id });
      if (!r.length) throw new UserError("Client introuvable.");
      await audit(db, { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, "update", "customer", id);
      return "Client modifié.";
    }
    const [c] = await db.insert(s.customers).values({ ...v, organizationId: ctx.org.id }).returning();
    await audit(db, { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, "create", "customer", c.id);
    return { message: "Client ajouté.", redirect: `/clients/${c.id}` };
  });
}

export async function archiveCustomerAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("customers.manage");
    const archived = str(fd, "archived") === "1";
    await db.update(s.customers).set({ archived }).where(and(eq(s.customers.id, str(fd, "id")), eq(s.customers.organizationId, ctx.org.id)));
    await audit(db, { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role }, archived ? "archive" : "restore", "customer", str(fd, "id"));
    return archived ? "Client archivé." : "Client restauré.";
  });
}

/* ───── Fournisseurs ───── */
export async function saveSupplierAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    const id = str(fd, "id");
    const v = {
      name: z.string().min(2, "Nom requis.").parse(str(fd, "name")), contact: optStr(fd, "contact"), phone: optStr(fd, "phone"),
      email: email(optStr(fd, "email")), address: optStr(fd, "address"), notes: optStr(fd, "notes"),
    };
    if (id) {
      const r = await db.update(s.suppliers).set(v).where(and(eq(s.suppliers.id, id), eq(s.suppliers.organizationId, ctx.org.id))).returning({ id: s.suppliers.id });
      if (!r.length) throw new UserError("Fournisseur introuvable.");
      return "Fournisseur modifié.";
    }
    await db.insert(s.suppliers).values({ ...v, organizationId: ctx.org.id });
    return "Fournisseur ajouté.";
  });
}

export async function archiveSupplierAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    const archived = str(fd, "archived") === "1";
    await db.update(s.suppliers).set({ archived }).where(and(eq(s.suppliers.id, str(fd, "id")), eq(s.suppliers.organizationId, ctx.org.id)));
    return archived ? "Fournisseur archivé." : "Fournisseur restauré.";
  });
}

/* ───── Catégories ───── */
export async function saveCategoryAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("products.manage");
    const name = z.string().min(2, "Nom requis.").parse(str(fd, "name"));
    const id = str(fd, "id");
    if (id) await db.update(s.categories).set({ name }).where(and(eq(s.categories.id, id), eq(s.categories.organizationId, ctx.org.id)));
    else await db.insert(s.categories).values({ organizationId: ctx.org.id, name });
    return id ? "Catégorie modifiée." : "Catégorie créée.";
  });
}

export async function deleteCategoryAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("products.manage");
    const id = str(fd, "id");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.products).where(and(eq(s.products.categoryId, id), eq(s.products.organizationId, ctx.org.id)));
    if (n > 0) {
      await db.update(s.categories).set({ archived: true }).where(and(eq(s.categories.id, id), eq(s.categories.organizationId, ctx.org.id)));
      return "Catégorie utilisée par des produits : elle a été archivée.";
    }
    await db.delete(s.categories).where(and(eq(s.categories.id, id), eq(s.categories.organizationId, ctx.org.id)));
    return "Catégorie supprimée.";
  });
}

/* ───── Produits ───── */
export async function saveProductAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("products.manage");
    const cx = { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role };
    const id = str(fd, "id");
    const categoryId = optStr(fd, "categoryId");
    const supplierId = optStr(fd, "supplierId");
    await own(s.categories, categoryId, ctx.org.id, "Catégorie");
    await own(s.suppliers, supplierId, ctx.org.id, "Fournisseur");
    const v = {
      name: z.string().min(2, "Nom du produit requis.").parse(str(fd, "name")),
      sku: z.string().min(1, "Référence SKU requise.").max(60).parse(str(fd, "sku")),
      barcode: optStr(fd, "barcode"), categoryId, supplierId, description: optStr(fd, "description"),
      purchasePrice: z.number().min(0, "Prix d'achat invalide.").parse(numOf(fd, "purchasePrice")),
      salePrice: z.number().min(0, "Prix de vente invalide.").parse(numOf(fd, "salePrice")),
      alertThreshold: z.number().int("Seuil entier requis.").min(0).parse(numOf(fd, "alertThreshold")),
      imageUrl: dataUrl(optStr(fd, "imageUrl")),
      active: !fd.has("hasActive") || bool(fd, "active"),
    };
    if (id) {
      const r = await db.update(s.products).set(v).where(and(eq(s.products.id, id), eq(s.products.organizationId, ctx.org.id))).returning({ id: s.products.id });
      if (!r.length) throw new UserError("Produit introuvable.");
      await audit(db, cx, "update", "product", id);
      return "Produit modifié.";
    }
    const initial = z.number().int("Le stock initial doit être un entier.").min(0, "Stock initial invalide.").parse(numOf(fd, "initialStock"));
    await db.transaction(async (tx) => {
      const [p] = await tx.insert(s.products).values({ ...v, organizationId: ctx.org.id }).returning();
      if (initial > 0) await moveStock(tx, cx, { productId: p.id, type: "entree", qty: initial, reason: "Stock initial", allowNegative: false });
      await audit(tx, cx, "create", "product", p.id, { sku: v.sku });
    });
    return "Produit créé.";
  });
}

export async function toggleProductAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("products.manage");
    const active = str(fd, "active") === "1";
    await db.update(s.products).set({ active }).where(and(eq(s.products.id, str(fd, "id")), eq(s.products.organizationId, ctx.org.id)));
    return active ? "Produit activé." : "Produit archivé.";
  });
}

/* ───── Catalogue de services ───── */
export async function saveServiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("catalog.manage");
    const id = str(fd, "id");
    const dur = str(fd, "durationMinutes");
    const v = {
      name: z.string().min(2, "Nom du service requis.").parse(str(fd, "name")), description: optStr(fd, "description"),
      price: z.number().min(0, "Tarif invalide.").parse(numOf(fd, "price")),
      durationMinutes: dur ? z.number().int().min(0).parse(Number(dur)) : null,
      active: !fd.has("hasActive") || bool(fd, "active"),
    };
    if (id) {
      const r = await db.update(s.services).set(v).where(and(eq(s.services.id, id), eq(s.services.organizationId, ctx.org.id))).returning({ id: s.services.id });
      if (!r.length) throw new UserError("Service introuvable.");
      return "Service modifié.";
    }
    await db.insert(s.services).values({ ...v, organizationId: ctx.org.id });
    return "Service ajouté au catalogue.";
  });
}

export async function toggleServiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("catalog.manage");
    const active = str(fd, "active") === "1";
    await db.update(s.services).set({ active }).where(and(eq(s.services.id, str(fd, "id")), eq(s.services.organizationId, ctx.org.id)));
    return active ? "Service activé." : "Service désactivé.";
  });
}

/* ───── Emplacements ───── */
export async function saveLocationAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("stock.manage");
    const name = z.string().min(2, "Nom requis.").parse(str(fd, "name"));
    await db.insert(s.stockLocations).values({ organizationId: ctx.org.id, name });
    return "Emplacement créé.";
  });
}
