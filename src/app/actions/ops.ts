"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { run, str, optStr, numOf, bool, type ActionState } from "@/lib/action";
import { actCtx, hashPassword, UserError, type Ctx } from "@/lib/auth";
import * as biz from "@/lib/biz";
import { today } from "@/lib/format";
import { can } from "@/lib/permissions";

const cxOf = (c: Ctx): biz.Cx => ({ orgId: c.org.id, userId: c.user.id, role: c.role });
const uuid = (msg: string) => z.string().uuid(msg);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const method = z.enum(["especes", "mobile_money", "virement", "carte", "autre"], { message: "Mode de paiement invalide." });

function payload(fd: FormData): unknown {
  try {
    return JSON.parse(String(fd.get("payload") ?? ""));
  } catch {
    throw new UserError("Formulaire invalide.");
  }
}
const lineSchema = z.object({
  kind: z.enum(["produit", "service", "libre"]),
  productId: z.string().uuid().nullish(),
  serviceId: z.string().uuid().nullish(),
  description: z.string().default(""),
  quantity: z.number(),
  unitPrice: z.number(),
});
const docSchema = z.object({
  id: z.string().optional(),
  customerId: uuid("Sélectionnez un client."),
  issueDate: dateStr,
  dueDate: dateStr.nullish().or(z.literal("")),
  lines: z.array(lineSchema).min(1, "Ajoutez au moins une ligne."),
  discount: z.number().min(0, "Remise invalide."),
  notes: z.string().nullish(),
});

/* ───────── Stock ───────── */
export async function stockMovementAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("stock.manage");
    const cx = cxOf(ctx);
    const d = z
      .object({
        productId: uuid("Produit requis."),
        type: z.enum(["entree", "sortie", "retour", "perte", "ajustement", "transfert"], { message: "Type de mouvement invalide." }),
        qty: z.number().int("Quantité entière requise."),
        locationId: z.string().uuid().nullish(),
        toLocationId: z.string().uuid().nullish(),
      })
      .parse({ productId: str(fd, "productId"), type: str(fd, "type"), qty: numOf(fd, "quantity"), locationId: optStr(fd, "locationId"), toLocationId: optStr(fd, "toLocationId") });
    const reason = optStr(fd, "reason");
    if (d.type !== "ajustement" && d.qty <= 0) throw new UserError("La quantité doit être strictement positive.");
    if (d.type === "ajustement" && d.qty === 0) throw new UserError("L'ajustement ne peut pas être nul.");
    const st = await biz.getSettings(db, ctx.org.id);
    await db.transaction(async (tx) => {
      if (d.type === "transfert") {
        if (!d.locationId || !d.toLocationId) throw new UserError("Choisissez les emplacements source et destination.");
        await biz.transferStock(tx, cx, { productId: d.productId, qty: d.qty, from: d.locationId, to: d.toLocationId, reason, allowNegative: st.allowNegativeStock });
      } else {
        const signed = d.type === "sortie" || d.type === "perte" ? -d.qty : d.qty;
        await biz.moveStock(tx, cx, { productId: d.productId, type: d.type, qty: signed, locationId: d.locationId, reason, allowNegative: st.allowNegativeStock });
      }
      await biz.audit(tx, cx, "stock_movement", "product", d.productId, { type: d.type, qty: d.qty });
    });
    return "Mouvement de stock enregistré.";
  });
}

export async function inventoryAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("stock.manage");
    const cx = cxOf(ctx);
    const productId = uuid("Produit requis.").parse(str(fd, "productId"));
    const counted = z.number().int("Quantité entière requise.").min(0, "Quantité invalide.").parse(numOf(fd, "counted"));
    const msg = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(s.products).where(and(eq(s.products.id, productId), eq(s.products.organizationId, ctx.org.id))).for("update");
      if (!p) throw new UserError("Produit introuvable.");
      const delta = counted - p.quantity;
      if (delta === 0) return "Aucun écart : stock conforme.";
      await biz.moveStock(tx, cx, { productId, type: "ajustement", qty: delta, reason: `Inventaire physique (${p.quantity} → ${counted})`, allowNegative: true });
      return `Inventaire enregistré : écart de ${delta > 0 ? "+" : ""}${delta}.`;
    });
    return msg;
  });
}

/* ───────── Prestations ───────── */
async function memberOk(orgId: string, userId: string | null) {
  if (!userId) return;
  const [m] = await db.select({ id: s.organizationMembers.id }).from(s.organizationMembers).where(and(eq(s.organizationMembers.organizationId, orgId), eq(s.organizationMembers.userId, userId), eq(s.organizationMembers.active, true)));
  if (!m) throw new UserError("Employé introuvable dans cette entreprise.");
}

export async function saveOrderAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("orders.manage");
    const cx = cxOf(ctx);
    const id = str(fd, "id");
    const customerId = uuid("Sélectionnez un client.").parse(str(fd, "customerId"));
    const serviceId = optStr(fd, "serviceId");
    const assigneeId = optStr(fd, "assigneeId");
    await memberOk(ctx.org.id, assigneeId);
    const [cust] = await db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.organizationId, ctx.org.id)));
    if (!cust) throw new UserError("Client introuvable.");
    let svc: typeof s.services.$inferSelect | undefined;
    if (serviceId) [svc] = await db.select().from(s.services).where(and(eq(s.services.id, serviceId), eq(s.services.organizationId, ctx.org.id)));
    if (serviceId && !svc) throw new UserError("Service introuvable.");
    const title = str(fd, "title") || svc?.name || "";
    if (title.length < 2) throw new UserError("Intitulé de la prestation requis.");
    const priceRaw = str(fd, "price");
    const price = z.number().min(0, "Prix invalide.").parse(priceRaw === "" ? (svc?.price ?? 0) : numOf(fd, "price"));
    const due = optStr(fd, "dueDate");
    if (due) dateStr.parse(due);
    const v = { customerId, serviceId, title, description: optStr(fd, "description"), price, assigneeId, dueDate: due, internalNotes: optStr(fd, "internalNotes") };
    if (id) {
      await db.transaction(async (tx) => {
        const [o] = await tx.select().from(s.serviceOrders).where(and(eq(s.serviceOrders.id, id), eq(s.serviceOrders.organizationId, ctx.org.id))).for("update");
        if (!o) throw new UserError("Prestation introuvable.");
        if (o.invoiceId && o.price !== price) throw new UserError("Prix non modifiable : la prestation est déjà facturée.");
        await tx.update(s.serviceOrders).set(v).where(eq(s.serviceOrders.id, id));
        await biz.audit(tx, cx, "update", "service_order", id, { before: { price: o.price, assigneeId: o.assigneeId, dueDate: o.dueDate }, after: { price, assigneeId, dueDate: due } });
        if (assigneeId && assigneeId !== o.assigneeId && assigneeId !== ctx.user.id)
          await biz.notify(tx, ctx.org.id, { userIds: [assigneeId], type: "new_order", title: `Prestation attribuée : ${o.reference}`, body: title, link: `/prestations/${id}` });
      });
      return "Prestation modifiée.";
    }
    const newId = await db.transaction(async (tx) => {
      const reference = await biz.nextRef(tx, ctx.org.id, "order");
      const [o] = await tx.insert(s.serviceOrders).values({ ...v, organizationId: ctx.org.id, reference, createdBy: ctx.user.id }).returning();
      await biz.audit(tx, cx, "create", "service_order", o.id, { reference });
      await biz.notify(tx, ctx.org.id, { perm: "orders.manage", userIds: [assigneeId], type: "new_order", title: `Nouvelle prestation : ${reference}`, body: title, link: `/prestations/${o.id}` });
      return o.id;
    });
    return { message: "Prestation créée.", redirect: `/prestations/${newId}` };
  });
}

export async function orderStatusAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx();
    const cx = cxOf(ctx);
    const id = str(fd, "id");
    const manage = can(ctx.role, "orders.manage");
    if (!manage && !can(ctx.role, "orders.own")) throw new UserError("Action non autorisée.");
    const status = z.enum(["en_attente", "acceptee", "en_cours", "en_pause", "terminee", "livree", "annulee"]).parse(str(fd, "status"));
    let progress = z.number().int().min(0).max(100).parse(numOf(fd, "progress"));
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(s.serviceOrders).where(and(eq(s.serviceOrders.id, id), eq(s.serviceOrders.organizationId, ctx.org.id))).for("update");
      if (!o) throw new UserError("Prestation introuvable.");
      if (!manage && o.assigneeId !== ctx.user.id) throw new UserError("Cette prestation ne vous est pas attribuée.");
      if (!manage && status === "annulee") throw new UserError("Seul un gestionnaire peut annuler une prestation.");
      if (status === "terminee" || status === "livree") progress = 100;
      const done = status === "terminee" || status === "livree";
      await tx
        .update(s.serviceOrders)
        .set({
          status, progress, internalNotes: optStr(fd, "internalNotes") ?? o.internalNotes,
          completedAt: done ? (o.completedAt ?? new Date()) : null,
        })
        .where(eq(s.serviceOrders.id, id));
      await biz.audit(tx, cx, "status", "service_order", id, { from: o.status, to: status, progress });
      if (status !== o.status)
        await biz.notify(tx, ctx.org.id, { perm: "orders.manage", type: "order_status", title: `${o.reference} : ${status.replace("_", " ")}`, body: o.title, link: `/prestations/${id}` });
    });
    return "Prestation mise à jour.";
  });
}

export async function addOrderCostAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx();
    const id = str(fd, "orderId");
    const manage = can(ctx.role, "orders.manage");
    if (!manage && !can(ctx.role, "orders.own")) throw new UserError("Action non autorisée.");
    const [o] = await db.select().from(s.serviceOrders).where(and(eq(s.serviceOrders.id, id), eq(s.serviceOrders.organizationId, ctx.org.id)));
    if (!o || (!manage && o.assigneeId !== ctx.user.id)) throw new UserError("Prestation introuvable.");
    const label = z.string().min(2, "Libellé requis.").parse(str(fd, "label"));
    const quantity = z.number().int().min(1, "Quantité invalide.").parse(numOf(fd, "quantity") || 1);
    const unitCost = z.number().min(0, "Coût invalide.").parse(numOf(fd, "unitCost"));
    await db.insert(s.serviceOrderItems).values({ organizationId: ctx.org.id, orderId: id, label, quantity, unitCost });
    await biz.audit(db, cxOf(ctx), "cost_added", "service_order", id, { label, quantity, unitCost });
    return "Coût enregistré.";
  });
}

export async function deleteOrderCostAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("orders.manage");
    await db.delete(s.serviceOrderItems).where(and(eq(s.serviceOrderItems.id, str(fd, "id")), eq(s.serviceOrderItems.organizationId, ctx.org.id)));
    await biz.audit(db, cxOf(ctx), "cost_removed", "service_order", str(fd, "orderId"));
    return "Coût supprimé.";
  });
}

export async function orderInvoiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("invoices.manage");
    const inv = await db.transaction((tx) => biz.invoiceFromOrder(tx, cxOf(ctx), str(fd, "id")));
    return { message: `Facture ${inv.reference} générée.`, redirect: `/factures/${inv.id}` };
  });
}

/* ───────── Ventes & paiements ───────── */
export async function createSaleAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("sales.create");
    const d = z
      .object({
        customerId: z.string().uuid().nullish().or(z.literal("")),
        lines: z.array(lineSchema).min(1, "Ajoutez au moins un produit."),
        discount: z.number().min(0),
        method,
        paid: z.number().min(0, "Montant encaissé invalide."),
        notes: z.string().nullish(),
      })
      .parse(payload(fd));
    const sale = await db.transaction((tx) =>
      biz.createSale(tx, cxOf(ctx), {
        customerId: d.customerId || null,
        lines: d.lines.map((l) => ({ productId: l.productId ?? "", quantity: l.quantity, unitPrice: l.unitPrice })),
        discount: d.discount, method: d.method, paid: d.paid, notes: d.notes || null,
      }),
    );
    return { message: `Vente ${sale.reference} validée.`, redirect: `/ventes/${sale.id}` };
  });
}

export async function cancelSaleAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("sales.cancel");
    await db.transaction((tx) => biz.cancelSale(tx, cxOf(ctx), str(fd, "id"), str(fd, "reason")));
    return "Vente annulée : stock réintégré et remboursements enregistrés.";
  });
}

export async function addPaymentAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("payments.create");
    const saleId = optStr(fd, "saleId");
    const invoiceId = optStr(fd, "invoiceId");
    if (!saleId && !invoiceId) throw new UserError("Document manquant.");
    const amount = z.number().positive("Montant invalide.").parse(numOf(fd, "amount"));
    const pay = await db.transaction((tx) => biz.postPayment(tx, cxOf(ctx), { saleId, invoiceId, amount, method: method.parse(str(fd, "method")), note: optStr(fd, "note") }));
    return { message: `Paiement enregistré (reçu ${pay.reference}).`, redirect: undefined };
  });
}

export async function saleInvoiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("invoices.manage");
    const inv = await db.transaction((tx) => biz.invoiceFromSale(tx, cxOf(ctx), str(fd, "id")));
    return { message: `Facture ${inv.reference} générée.`, redirect: `/factures/${inv.id}` };
  });
}

/* ───────── Devis & factures ───────── */
export async function saveQuoteAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("quotes.manage");
    const d = docSchema.parse(payload(fd));
    const q = await db.transaction((tx) =>
      biz.createQuote(tx, cxOf(ctx), {
        customerId: d.customerId, issueDate: d.issueDate, validUntil: d.dueDate || null, discount: d.discount, notes: d.notes || null, quoteId: d.id || undefined,
        lines: d.lines.map((l) => ({ ...l, kind: l.kind })),
      }),
    );
    return { message: `Devis ${q.reference} enregistré.`, redirect: `/devis/${q.id}` };
  });
}

export async function quoteStatusAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("quotes.manage");
    const status = z.enum(["brouillon", "envoye", "accepte", "refuse"]).parse(str(fd, "status"));
    const [q] = await db.select().from(s.quotes).where(and(eq(s.quotes.id, str(fd, "id")), eq(s.quotes.organizationId, ctx.org.id)));
    if (!q) throw new UserError("Devis introuvable.");
    if (q.status === "converti") throw new UserError("Devis déjà converti en facture.");
    await db.update(s.quotes).set({ status }).where(eq(s.quotes.id, q.id));
    await biz.audit(db, cxOf(ctx), "status", "quote", q.id, { from: q.status, to: status });
    return "Statut du devis mis à jour.";
  });
}

export async function quoteConvertAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("invoices.manage");
    const inv = await db.transaction(async (tx) => {
      const [q] = await tx.select().from(s.quotes).where(and(eq(s.quotes.id, str(fd, "id")), eq(s.quotes.organizationId, ctx.org.id))).for("update");
      if (!q) throw new UserError("Devis introuvable.");
      if (q.status === "converti") throw new UserError("Ce devis est déjà converti.");
      if (q.status === "refuse") throw new UserError("Un devis refusé ne peut pas être converti.");
      const items = await tx.select().from(s.quoteItems).where(eq(s.quoteItems.quoteId, q.id));
      const st = await biz.getSettings(tx, ctx.org.id);
      return biz.createInvoice(tx, cxOf(ctx), {
        customerId: q.customerId, issueDate: today(st.timezone), dueDate: null, discount: q.discount, notes: q.notes, deductStock: true, quoteId: q.id,
        lines: items.map((i) => ({ kind: i.kind as "produit" | "service" | "libre", productId: i.productId, serviceId: i.serviceId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
      });
    });
    return { message: `Facture ${inv.reference} créée à partir du devis.`, redirect: `/factures/${inv.id}` };
  });
}

export async function createInvoiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("invoices.manage");
    const d = docSchema.parse(payload(fd));
    const inv = await db.transaction((tx) =>
      biz.createInvoice(tx, cxOf(ctx), {
        customerId: d.customerId, issueDate: d.issueDate, dueDate: d.dueDate || null, discount: d.discount, notes: d.notes || null, deductStock: true,
        lines: d.lines.map((l) => ({ ...l, kind: l.kind })),
      }),
    );
    return { message: `Facture ${inv.reference} émise.`, redirect: `/factures/${inv.id}` };
  });
}

export async function cancelInvoiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("invoices.manage");
    await db.transaction((tx) => biz.cancelInvoice(tx, cxOf(ctx), str(fd, "id"), str(fd, "reason")));
    return "Facture annulée : un avoir a été émis.";
  });
}

/* ───────── Finances ───────── */
export async function saveExpenseAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("expenses.manage");
    const id = str(fd, "id");
    const categoryId = optStr(fd, "categoryId");
    const supplierId = optStr(fd, "supplierId");
    if (categoryId) {
      const [c] = await db.select().from(s.expenseCategories).where(and(eq(s.expenseCategories.id, categoryId), eq(s.expenseCategories.organizationId, ctx.org.id)));
      if (!c) throw new UserError("Catégorie introuvable.");
    }
    if (supplierId) {
      const [c] = await db.select().from(s.suppliers).where(and(eq(s.suppliers.id, supplierId), eq(s.suppliers.organizationId, ctx.org.id)));
      if (!c) throw new UserError("Fournisseur introuvable.");
    }
    const receipt = optStr(fd, "receiptUrl");
    if (receipt && (!receipt.startsWith("data:") || receipt.length > 900_000)) throw new UserError("Pièce justificative invalide ou trop volumineuse.");
    const v = {
      categoryId, supplierId, label: z.string().min(2, "Libellé requis.").parse(str(fd, "label")),
      amount: z.number().positive("Montant invalide.").parse(numOf(fd, "amount")), date: dateStr.parse(str(fd, "date")),
      method: method.parse(str(fd, "method") || "especes"), receiptUrl: receipt, notes: optStr(fd, "notes"),
    };
    if (id) {
      const r = await db.update(s.expenses).set(v).where(and(eq(s.expenses.id, id), eq(s.expenses.organizationId, ctx.org.id))).returning({ id: s.expenses.id });
      if (!r.length) throw new UserError("Dépense introuvable.");
      await biz.audit(db, cxOf(ctx), "update", "expense", id, { amount: v.amount });
      return "Dépense modifiée.";
    }
    const [e] = await db.insert(s.expenses).values({ ...v, organizationId: ctx.org.id, createdBy: ctx.user.id }).returning();
    await biz.audit(db, cxOf(ctx), "create", "expense", e.id, { amount: v.amount });
    return "Dépense enregistrée.";
  });
}

export async function deleteExpenseAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("expenses.manage");
    const [e] = await db.select().from(s.expenses).where(and(eq(s.expenses.id, str(fd, "id")), eq(s.expenses.organizationId, ctx.org.id)));
    if (!e) throw new UserError("Dépense introuvable.");
    if (e.purchaseOrderId) throw new UserError("Cette dépense correspond à un règlement fournisseur et ne peut pas être supprimée.");
    await db.delete(s.expenses).where(eq(s.expenses.id, e.id));
    await biz.audit(db, cxOf(ctx), "delete", "expense", e.id, { label: e.label, amount: e.amount });
    return "Dépense supprimée.";
  });
}

export async function saveExpenseCategoryAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("expenses.manage");
    await db.insert(s.expenseCategories).values({ organizationId: ctx.org.id, name: z.string().min(2, "Nom requis.").parse(str(fd, "name")) });
    return "Catégorie ajoutée.";
  });
}

export async function otherIncomeAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("expenses.manage");
    await db.transaction((tx) =>
      biz.otherIncome(tx, cxOf(ctx), {
        amount: numOf(fd, "amount"), label: z.string().min(2, "Libellé requis.").parse(str(fd, "label")), method: method.parse(str(fd, "method")), note: optStr(fd, "note"), customerId: optStr(fd, "customerId"),
      }),
    );
    return "Recette enregistrée.";
  });
}

/* ───────── Achats fournisseurs ───────── */
export async function createPOAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    const d = z
      .object({
        supplierId: uuid("Sélectionnez un fournisseur."), orderDate: dateStr, expectedDate: dateStr.nullish().or(z.literal("")),
        supplierInvoiceRef: z.string().nullish(), notes: z.string().nullish(),
        lines: z.array(z.object({ productId: uuid("Produit requis."), quantity: z.number().int().min(1, "Quantité invalide."), unitCost: z.number().min(0, "Coût invalide.") })).min(1, "Ajoutez au moins un produit."),
      })
      .parse(payload(fd));
    const cx = cxOf(ctx);
    const po = await db.transaction(async (tx) => {
      const [sup] = await tx.select().from(s.suppliers).where(and(eq(s.suppliers.id, d.supplierId), eq(s.suppliers.organizationId, ctx.org.id)));
      if (!sup) throw new UserError("Fournisseur introuvable.");
      const pids = [...new Set(d.lines.map((l) => l.productId))];
      const prods = await tx.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.organizationId, ctx.org.id), inArray(s.products.id, pids)));
      if (prods.length !== pids.length) throw new UserError("Produit introuvable.");
      const total = d.lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
      const reference = await biz.nextRef(tx, ctx.org.id, "purchase");
      const [p] = await tx
        .insert(s.purchaseOrders)
        .values({ organizationId: ctx.org.id, reference, supplierId: d.supplierId, orderDate: d.orderDate, expectedDate: d.expectedDate || null, total, supplierInvoiceRef: d.supplierInvoiceRef || null, notes: d.notes || null, createdBy: ctx.user.id })
        .returning();
      await tx.insert(s.purchaseOrderItems).values(d.lines.map((l) => ({ organizationId: ctx.org.id, purchaseOrderId: p.id, productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })));
      await biz.audit(tx, cx, "create", "purchase_order", p.id, { reference, total });
      return p;
    });
    return { message: `Commande ${po.reference} enregistrée.`, redirect: "/fournisseurs?tab=commandes" };
  });
}

export async function receivePOAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    await db.transaction((tx) => biz.receivePurchaseOrder(tx, cxOf(ctx), str(fd, "id")));
    return "Commande réceptionnée : le stock a été mis à jour.";
  });
}

export async function payPOAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    await db.transaction((tx) => biz.payPurchaseOrder(tx, cxOf(ctx), str(fd, "id"), numOf(fd, "amount"), method.parse(str(fd, "method"))));
    return "Règlement fournisseur enregistré (dépense créée).";
  });
}

export async function cancelPOAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    const [po] = await db.select().from(s.purchaseOrders).where(and(eq(s.purchaseOrders.id, str(fd, "id")), eq(s.purchaseOrders.organizationId, ctx.org.id)));
    if (!po || po.status !== "commandee") throw new UserError("Seule une commande non reçue peut être annulée.");
    if (po.paid > 0) throw new UserError("Des règlements existent : annulation impossible.");
    await db.update(s.purchaseOrders).set({ status: "annulee" }).where(eq(s.purchaseOrders.id, po.id));
    await biz.audit(db, cxOf(ctx), "cancel", "purchase_order", po.id);
    return "Commande annulée.";
  });
}

export async function setSupplierInvoiceAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("suppliers.manage");
    await db.update(s.purchaseOrders).set({ supplierInvoiceRef: optStr(fd, "ref") }).where(and(eq(s.purchaseOrders.id, str(fd, "id")), eq(s.purchaseOrders.organizationId, ctx.org.id)));
    return "Facture fournisseur enregistrée.";
  });
}

/* ───────── Utilisateurs ───────── */
const roleEnum = z.enum(["proprietaire", "administrateur", "gestionnaire", "caissier", "technicien"], { message: "Rôle invalide." });

export async function addMemberAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("users.manage");
    const role = roleEnum.parse(str(fd, "role"));
    if (role === "proprietaire" && ctx.role !== "proprietaire") throw new UserError("Seul un propriétaire peut nommer un propriétaire.");
    const email = z.string().email("Adresse email invalide.").parse(str(fd, "email").toLowerCase());
    await db.transaction(async (tx) => {
      let [u] = await tx.select().from(s.profiles).where(eq(s.profiles.email, email));
      if (!u) {
        const pw = z.string().min(8, "Mot de passe temporaire : 8 caractères min.").parse(String(fd.get("password") ?? ""));
        [u] = await tx.insert(s.profiles).values({ email, fullName: z.string().min(2, "Nom requis.").parse(str(fd, "fullName")), passwordHash: hashPassword(pw) }).returning();
      }
      const [ex] = await tx.select().from(s.organizationMembers).where(and(eq(s.organizationMembers.organizationId, ctx.org.id), eq(s.organizationMembers.userId, u.id)));
      if (ex) throw new UserError("Cet utilisateur fait déjà partie de l'entreprise.");
      await tx.insert(s.organizationMembers).values({ organizationId: ctx.org.id, userId: u.id, role });
      await biz.audit(tx, cxOf(ctx), "member_add", "member", u.id, { email, role });
    });
    return "Utilisateur ajouté.";
  });
}

export async function changeRoleAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("users.manage");
    const role = roleEnum.parse(str(fd, "role"));
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(s.organizationMembers).where(and(eq(s.organizationMembers.id, str(fd, "id")), eq(s.organizationMembers.organizationId, ctx.org.id))).for("update");
      if (!m) throw new UserError("Membre introuvable.");
      if (m.userId === ctx.user.id) throw new UserError("Vous ne pouvez pas modifier votre propre rôle.");
      if ((m.role === "proprietaire" || role === "proprietaire") && ctx.role !== "proprietaire") throw new UserError("Seul un propriétaire peut gérer le rôle de propriétaire.");
      if (m.role === "proprietaire" && role !== "proprietaire") {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.organizationMembers).where(and(eq(s.organizationMembers.organizationId, ctx.org.id), eq(s.organizationMembers.role, "proprietaire"), eq(s.organizationMembers.active, true), ne(s.organizationMembers.id, m.id)));
        if (n < 1) throw new UserError("L'entreprise doit conserver au moins un propriétaire.");
      }
      await tx.update(s.organizationMembers).set({ role }).where(eq(s.organizationMembers.id, m.id));
      await biz.audit(tx, cxOf(ctx), "role_change", "member", m.userId, { from: m.role, to: role });
    });
    return "Rôle modifié.";
  });
}

export async function toggleMemberAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("users.manage");
    const active = str(fd, "active") === "1";
    const [m] = await db.select().from(s.organizationMembers).where(and(eq(s.organizationMembers.id, str(fd, "id")), eq(s.organizationMembers.organizationId, ctx.org.id)));
    if (!m) throw new UserError("Membre introuvable.");
    if (m.userId === ctx.user.id) throw new UserError("Vous ne pouvez pas vous désactiver vous-même.");
    if (m.role === "proprietaire" && ctx.role !== "proprietaire") throw new UserError("Seul un propriétaire peut désactiver un propriétaire.");
    await db.update(s.organizationMembers).set({ active }).where(eq(s.organizationMembers.id, m.id));
    await biz.audit(db, cxOf(ctx), active ? "member_enable" : "member_disable", "member", m.userId);
    return active ? "Utilisateur réactivé." : "Utilisateur désactivé.";
  });
}

/* ───────── Paramètres ───────── */
export async function saveOrgAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("settings.manage");
    const em = optStr(fd, "email");
    if (em) z.string().email("Email professionnel invalide.").parse(em);
    const logo = optStr(fd, "logoUrl");
    if (logo && (!logo.startsWith("data:image/") || logo.length > 900_000)) throw new UserError("Logo invalide (image < 600 Ko).");
    await db.update(s.organizations).set({
      name: z.string().min(2, "Nom requis.").parse(str(fd, "name")), email: em, phone: optStr(fd, "phone"), address: optStr(fd, "address"), taxId: optStr(fd, "taxId"), logoUrl: logo,
    }).where(eq(s.organizations.id, ctx.org.id));
    await biz.audit(db, cxOf(ctx), "update", "organization", ctx.org.id);
    return "Informations de l'entreprise enregistrées.";
  });
}

export async function saveSettingsAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("settings.manage");
    const tz = str(fd, "timezone");
    try { new Intl.DateTimeFormat("fr-FR", { timeZone: tz }); } catch { throw new UserError("Fuseau horaire invalide (ex : Africa/Ouagadougou)."); }
    const pre = (k: string, d: string) => z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/, "Préfixes : lettres/chiffres uniquement.").parse(str(fd, k) || d);
    const v = {
      currency: z.string().length(3, "Code devise ISO sur 3 lettres.").parse(str(fd, "currency").toUpperCase()),
      currencyLabel: z.string().min(1).max(8).parse(str(fd, "currencyLabel")),
      locale: str(fd, "locale") || "fr-FR", timezone: tz,
      taxEnabled: bool(fd, "taxEnabled"), taxName: str(fd, "taxName") || "TVA",
      taxRate: z.number().min(0).max(100, "Taux de taxe invalide.").parse(numOf(fd, "taxRate")),
      invoicePrefix: pre("invoicePrefix", "FAC"), quotePrefix: pre("quotePrefix", "DEV"), salePrefix: pre("salePrefix", "VTE"), orderPrefix: pre("orderPrefix", "PRS"), purchasePrefix: pre("purchasePrefix", "CMD"),
      paymentTermsDays: z.number().int().min(0).max(365).parse(numOf(fd, "paymentTermsDays")),
      quoteValidityDays: z.number().int().min(1).max(365).parse(numOf(fd, "quoteValidityDays")),
      invoiceFooter: optStr(fd, "invoiceFooter"),
      ...(ctx.role === "proprietaire" ? { allowNegativeStock: bool(fd, "allowNegativeStock") } : {}),
    };
    await db.update(s.organizationSettings).set(v).where(eq(s.organizationSettings.organizationId, ctx.org.id));
    await biz.audit(db, cxOf(ctx), "update", "settings", ctx.org.id, v);
    return "Paramètres enregistrés.";
  });
}

/* ───────── Notifications ───────── */
export async function markNotificationAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx("notifications.view");
    const id = str(fd, "id");
    const cond = id
      ? and(eq(s.notifications.id, id), eq(s.notifications.userId, ctx.user.id), eq(s.notifications.organizationId, ctx.org.id))
      : and(eq(s.notifications.userId, ctx.user.id), eq(s.notifications.organizationId, ctx.org.id));
    await db.update(s.notifications).set({ read: true }).where(cond);
    return id ? "Notification lue." : "Toutes les notifications sont marquées comme lues.";
  });
}
