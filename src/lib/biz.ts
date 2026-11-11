import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/core";
import { can } from "@/lib/permissions";
import { addDays, fmtMoney, num, round2, today } from "@/lib/format";

/**
 * Règles métier critiques – toutes les fonctions prennent une transaction PostgreSQL.
 * L'isolation multi-entreprises est garantie par `cx.orgId` dans chaque requête.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Q = Tx | typeof db;
export type Cx = { orgId: string; userId: string; role: s.Role };
export type Settings = typeof s.organizationSettings.$inferSelect;

export async function audit(q: Q, cx: Cx, action: string, entity: string, entityId?: string | null, details?: unknown) {
  await q.insert(s.auditLogs).values({
    organizationId: cx.orgId,
    userId: cx.userId,
    action,
    entity,
    entityId: entityId ?? null,
    details: (details ?? null) as never,
  });
}

export async function getSettings(q: Q, orgId: string): Promise<Settings> {
  const [row] = await q.select().from(s.organizationSettings).where(eq(s.organizationSettings.organizationId, orgId));
  if (!row) throw new UserError("Paramètres de l'entreprise introuvables.");
  return row;
}

const SEQ = {
  invoice: { col: "invoiceSeq", pre: "invoicePrefix", fixed: "" },
  credit: { col: "creditSeq", pre: null, fixed: "AV" },
  quote: { col: "quoteSeq", pre: "quotePrefix", fixed: "" },
  sale: { col: "saleSeq", pre: "salePrefix", fixed: "" },
  order: { col: "orderSeq", pre: "orderPrefix", fixed: "" },
  purchase: { col: "purchaseSeq", pre: "purchasePrefix", fixed: "" },
  receipt: { col: "receiptSeq", pre: null, fixed: "REC" },
} as const;

/** Numérotation automatique atomique (UPDATE ... RETURNING verrouille la ligne). */
export async function nextRef(q: Q, orgId: string, kind: keyof typeof SEQ): Promise<string> {
  const k = SEQ[kind];
  const [row] = await q
    .update(s.organizationSettings)
    .set({ [k.col]: sql`${s.organizationSettings[k.col]} + 1` } as never)
    .where(eq(s.organizationSettings.organizationId, orgId))
    .returning();
  const seq = row[k.col] as number;
  const prefix = k.pre ? (row[k.pre] as string) : k.fixed;
  return `${prefix}-${today(row.timezone).slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

export async function notify(
  q: Q,
  orgId: string,
  o: { perm?: string; userIds?: (string | null | undefined)[]; type: string; title: string; body?: string; link?: string; dedupeKey?: string },
) {
  const members = await q
    .select({ userId: s.organizationMembers.userId, role: s.organizationMembers.role })
    .from(s.organizationMembers)
    .where(and(eq(s.organizationMembers.organizationId, orgId), eq(s.organizationMembers.active, true)));
  const wanted = new Set((o.userIds ?? []).filter(Boolean) as string[]);
  const targets = members.filter((m) => wanted.has(m.userId) || (o.perm ? can(m.role, o.perm) : false));
  if (!targets.length) return;
  await q
    .insert(s.notifications)
    .values(
      targets.map((m) => ({
        organizationId: orgId,
        userId: m.userId,
        type: o.type,
        title: o.title,
        body: o.body ?? null,
        link: o.link ?? null,
        dedupeKey: o.dedupeKey ?? null,
      })),
    )
    .onConflictDoNothing();
}

/* ───────── Organisation ───────── */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Loyer", "Transport", "Achat de marchandises", "Salaires", "Internet", "Électricité", "Maintenance", "Autres dépenses",
];

export async function createOrganization(
  tx: Tx,
  userId: string,
  d: { name: string; email?: string | null; phone?: string | null; address?: string | null; currency?: string; currencyLabel?: string },
) {
  const [org] = await tx
    .insert(s.organizations)
    .values({ name: d.name, email: d.email ?? null, phone: d.phone ?? null, address: d.address ?? null })
    .returning();
  await tx.insert(s.organizationSettings).values({
    organizationId: org.id,
    currency: d.currency ?? "XOF",
    currencyLabel: d.currencyLabel ?? "FCFA",
  });
  await tx.insert(s.organizationMembers).values({ organizationId: org.id, userId, role: "proprietaire" });
  await tx.insert(s.stockLocations).values({ organizationId: org.id, name: "Magasin principal", isDefault: true });
  await tx.insert(s.expenseCategories).values(DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ organizationId: org.id, name })));
  await audit(tx, { orgId: org.id, userId, role: "proprietaire" }, "create", "organization", org.id, { name: d.name });
  return org;
}

/* ───────── Stock ───────── */
export async function defaultLocation(q: Q, orgId: string): Promise<string> {
  const [loc] = await q
    .select()
    .from(s.stockLocations)
    .where(eq(s.stockLocations.organizationId, orgId))
    .orderBy(sql`${s.stockLocations.isDefault} desc`)
    .limit(1);
  if (loc) return loc.id;
  const [n] = await q.insert(s.stockLocations).values({ organizationId: orgId, name: "Magasin principal", isDefault: true }).returning();
  return n.id;
}

export async function moveStock(
  tx: Tx,
  cx: Cx,
  o: { productId: string; type: string; qty: number; locationId?: string | null; reason?: string | null; reference?: string | null; allowNegative: boolean },
) {
  if (!Number.isInteger(o.qty) || o.qty === 0) throw new UserError("Quantité invalide.");
  const [p] = await tx
    .select()
    .from(s.products)
    .where(and(eq(s.products.id, o.productId), eq(s.products.organizationId, cx.orgId)))
    .for("update");
  if (!p) throw new UserError("Produit introuvable.");
  const nq = p.quantity + o.qty;
  if (nq < 0 && !o.allowNegative) throw new UserError(`Stock insuffisant pour « ${p.name} » (disponible : ${p.quantity}).`);
  const locationId = o.locationId ?? (await defaultLocation(tx, cx.orgId));
  await tx.update(s.products).set({ quantity: nq }).where(eq(s.products.id, p.id));
  await tx.insert(s.stockMovements).values({
    organizationId: cx.orgId,
    productId: p.id,
    locationId,
    type: o.type,
    quantity: o.qty,
    balanceAfter: nq,
    reason: o.reason ?? null,
    reference: o.reference ?? null,
    userId: cx.userId,
  });
  if (o.qty < 0 && nq <= p.alertThreshold) {
    await notify(tx, cx.orgId, {
      perm: "stock.manage",
      type: nq <= 0 ? "stock_out" : "stock_low",
      title: nq <= 0 ? `Produit épuisé : ${p.name}` : `Stock faible : ${p.name}`,
      body: `Quantité restante : ${nq} (seuil ${p.alertThreshold})`,
      link: "/stocks",
      dedupeKey: `stock:${p.id}:${nq}`,
    });
  }
  return { product: p, newQty: nq };
}

export async function transferStock(
  tx: Tx,
  cx: Cx,
  o: { productId: string; qty: number; from: string; to: string; reason?: string | null; allowNegative: boolean },
) {
  if (o.from === o.to) throw new UserError("Les emplacements source et destination doivent être différents.");
  if (!Number.isInteger(o.qty) || o.qty <= 0) throw new UserError("Quantité invalide.");
  const locs = await tx
    .select({ id: s.stockLocations.id })
    .from(s.stockLocations)
    .where(and(eq(s.stockLocations.organizationId, cx.orgId), inArray(s.stockLocations.id, [o.from, o.to])));
  if (locs.length !== 2) throw new UserError("Emplacement introuvable.");
  const [p] = await tx
    .select()
    .from(s.products)
    .where(and(eq(s.products.id, o.productId), eq(s.products.organizationId, cx.orgId)))
    .for("update");
  if (!p) throw new UserError("Produit introuvable.");
  const [lvl] = await tx
    .select({ q: sql<number>`coalesce(sum(${s.stockMovements.quantity}),0)::int` })
    .from(s.stockMovements)
    .where(and(eq(s.stockMovements.productId, p.id), eq(s.stockMovements.locationId, o.from)));
  if (lvl.q < o.qty && !o.allowNegative) throw new UserError(`Stock insuffisant à l'emplacement source (disponible : ${lvl.q}).`);
  for (const [loc, q] of [[o.from, -o.qty], [o.to, o.qty]] as const) {
    await tx.insert(s.stockMovements).values({
      organizationId: cx.orgId, productId: p.id, locationId: loc, type: "transfert", quantity: q,
      balanceAfter: p.quantity, reason: o.reason ?? "Transfert entre emplacements", userId: cx.userId,
    });
  }
}

/* ───────── Totaux ───────── */
export function computeTotals(lines: { quantity: number; unitPrice: number }[], discount: number, st: Settings) {
  const subtotal = round2(lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  if (!(discount >= 0)) throw new UserError("Remise invalide.");
  if (discount > subtotal) throw new UserError("La remise ne peut pas dépasser le sous-total.");
  const base = subtotal - discount;
  const taxAmount = st.taxEnabled ? round2((base * st.taxRate) / 100) : 0;
  return { subtotal, discount: round2(discount), taxAmount, total: round2(base + taxAmount) };
}

async function assertCustomer(q: Q, orgId: string, id: string | null | undefined) {
  if (!id) return;
  const [c] = await q.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.id, id), eq(s.customers.organizationId, orgId)));
  if (!c) throw new UserError("Client introuvable.");
}

/* ───────── Paiements ───────── */
export async function postPayment(
  tx: Tx,
  cx: Cx,
  o: { saleId?: string | null; invoiceId?: string | null; amount: number; method: s.PayMethod; note?: string | null; label?: string | null },
) {
  const lockSale = async (id: string) =>
    (await tx.select().from(s.sales).where(and(eq(s.sales.id, id), eq(s.sales.organizationId, cx.orgId))).for("update"))[0];
  const lockInv = async (id: string) =>
    (await tx.select().from(s.invoices).where(and(eq(s.invoices.id, id), eq(s.invoices.organizationId, cx.orgId))).for("update"))[0];
  let sale = o.saleId ? await lockSale(o.saleId) : undefined;
  let inv = o.invoiceId ? await lockInv(o.invoiceId) : undefined;
  if (sale?.invoiceId && !inv) inv = await lockInv(sale.invoiceId);
  if (inv?.saleId && !sale) sale = await lockSale(inv.saleId);
  if (!sale && !inv) throw new UserError("Document introuvable.");
  if (sale && sale.status !== "validee") throw new UserError("Cette vente est annulée.");
  if (inv && (inv.status === "annulee" || inv.type !== "facture")) throw new UserError("Cette facture est annulée.");
  const amount = round2(o.amount);
  if (!amount) throw new UserError("Montant invalide.");
  const primary = (inv ?? sale)!;
  if (amount > 0 && amount > primary.total - primary.paid + 0.005)
    throw new UserError(`Le montant dépasse le reste à payer (${round2(primary.total - primary.paid)}).`);
  if (amount < 0 && -amount > primary.paid + 0.005) throw new UserError("Remboursement supérieur au montant payé.");
  if (sale) await tx.update(s.sales).set({ paid: round2(sale.paid + amount) }).where(eq(s.sales.id, sale.id));
  if (inv) {
    const np = round2(inv.paid + amount);
    await tx
      .update(s.invoices)
      .set({ paid: np, status: np >= inv.total - 0.005 ? "payee" : np > 0 ? "partielle" : "emise" })
      .where(eq(s.invoices.id, inv.id));
  }
  const reference = await nextRef(tx, cx.orgId, "receipt");
  const [pay] = await tx
    .insert(s.payments)
    .values({
      organizationId: cx.orgId, reference, kind: inv ? "facture" : "vente", saleId: sale?.id ?? null, invoiceId: inv?.id ?? null,
      customerId: primary.customerId, amount, method: o.method, note: o.note ?? null, label: o.label ?? null, createdBy: cx.userId,
    })
    .returning();
  await audit(tx, cx, amount > 0 ? "payment" : "refund", "payment", pay.id, { amount, ref: primary.reference });
  if (amount > 0) {
    const st = await getSettings(tx, cx.orgId);
    await notify(tx, cx.orgId, {
      perm: "finance.view", type: "payment", title: `Nouveau paiement : ${fmtMoney(amount, st)}`,
      body: `${primary.reference} – reçu ${reference}`, link: inv ? `/factures/${inv.id}` : `/ventes/${sale!.id}`,
    });
  }
  return pay;
}

export async function otherIncome(tx: Tx, cx: Cx, o: { amount: number; label: string; method: s.PayMethod; note?: string | null; customerId?: string | null }) {
  if (!(o.amount > 0)) throw new UserError("Montant invalide.");
  await assertCustomer(tx, cx.orgId, o.customerId);
  const reference = await nextRef(tx, cx.orgId, "receipt");
  const [pay] = await tx
    .insert(s.payments)
    .values({ organizationId: cx.orgId, reference, kind: "autre", amount: round2(o.amount), method: o.method, label: o.label, note: o.note ?? null, customerId: o.customerId ?? null, createdBy: cx.userId })
    .returning();
  await audit(tx, cx, "create", "payment", pay.id, { amount: o.amount, label: o.label });
  return pay;
}

/* ───────── Ventes ───────── */
export type SaleInput = {
  customerId: string | null;
  lines: { productId: string; quantity: number; unitPrice?: number }[];
  discount: number;
  method: s.PayMethod;
  paid: number;
  notes: string | null;
};

export async function createSale(tx: Tx, cx: Cx, o: SaleInput) {
  const st = await getSettings(tx, cx.orgId);
  if (!o.lines.length) throw new UserError("Ajoutez au moins un produit.");
  await assertCustomer(tx, cx.orgId, o.customerId);
  const ids = [...new Set(o.lines.map((l) => l.productId))];
  const prods = await tx.select().from(s.products).where(and(eq(s.products.organizationId, cx.orgId), inArray(s.products.id, ids)));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const priceOverride = can(cx.role, "sales.discount");
  const lines = o.lines.map((l) => {
    const p = pm.get(l.productId);
    if (!p || !p.active) throw new UserError("Produit introuvable ou inactif.");
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new UserError("Quantité invalide.");
    const unitPrice = priceOverride && l.unitPrice != null && l.unitPrice >= 0 ? l.unitPrice : p.salePrice;
    return { p, quantity: l.quantity, unitPrice };
  });
  if (o.discount > 0 && !priceOverride) throw new UserError("Vous n'êtes pas autorisé à appliquer une remise.");
  const t = computeTotals(lines, o.discount, st);
  const paid = round2(o.paid);
  if (paid < 0 || paid > t.total + 0.005) throw new UserError("Montant encaissé invalide.");
  const reference = await nextRef(tx, cx.orgId, "sale");
  const [sale] = await tx
    .insert(s.sales)
    .values({ organizationId: cx.orgId, reference, customerId: o.customerId, ...t, paid: 0, notes: o.notes, createdBy: cx.userId })
    .returning();
  await tx.insert(s.saleItems).values(
    lines.map((l) => ({ organizationId: cx.orgId, saleId: sale.id, productId: l.p.id, name: l.p.name, quantity: l.quantity, unitPrice: l.unitPrice, unitCost: l.p.purchasePrice })),
  );
  for (const l of lines)
    await moveStock(tx, cx, { productId: l.p.id, type: "vente", qty: -l.quantity, reference, reason: `Vente ${reference}`, allowNegative: st.allowNegativeStock });
  if (paid > 0) await postPayment(tx, cx, { saleId: sale.id, amount: paid, method: o.method });
  await audit(tx, cx, "create", "sale", sale.id, { reference, total: t.total });
  return { ...sale, paid };
}

export async function cancelSale(tx: Tx, cx: Cx, saleId: string, reason: string) {
  const st = await getSettings(tx, cx.orgId);
  const [sale] = await tx.select().from(s.sales).where(and(eq(s.sales.id, saleId), eq(s.sales.organizationId, cx.orgId))).for("update");
  if (!sale) throw new UserError("Vente introuvable.");
  if (sale.status === "annulee") throw new UserError("Vente déjà annulée.");
  if (!reason.trim()) throw new UserError("Le motif d'annulation est obligatoire.");
  if (sale.paid > 0) await postPayment(tx, cx, { saleId: sale.id, amount: -sale.paid, method: "autre", label: "Remboursement", note: `Annulation ${sale.reference}` });
  if (sale.invoiceId) await cancelInvoice(tx, cx, sale.invoiceId, `Vente ${sale.reference} annulée : ${reason}`, true);
  const items = await tx.select().from(s.saleItems).where(eq(s.saleItems.saleId, sale.id));
  for (const it of items)
    if (it.productId)
      await moveStock(tx, cx, { productId: it.productId, type: "retour", qty: it.quantity, reference: sale.reference, reason: `Annulation vente ${sale.reference}`, allowNegative: st.allowNegativeStock });
  await tx.update(s.sales).set({ status: "annulee", notes: [sale.notes, `Annulée : ${reason}`].filter(Boolean).join("\n") }).where(eq(s.sales.id, sale.id));
  await audit(tx, cx, "cancel", "sale", sale.id, { reason });
}

/* ───────── Documents (devis / factures) ───────── */
export type DocLine = { kind: "produit" | "service" | "libre"; productId?: string | null; serviceId?: string | null; description: string; quantity: number; unitPrice: number };

export async function resolveLines(q: Q, orgId: string, lines: DocLine[]) {
  if (!lines.length) throw new UserError("Ajoutez au moins une ligne.");
  const pids = lines.filter((l) => l.kind === "produit" && l.productId).map((l) => l.productId as string);
  const prods = pids.length ? await q.select().from(s.products).where(and(eq(s.products.organizationId, orgId), inArray(s.products.id, pids))) : [];
  const pm = new Map(prods.map((p) => [p.id, p]));
  return lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new UserError("Quantité invalide.");
    if (!(l.unitPrice >= 0)) throw new UserError("Prix unitaire invalide.");
    let description = (l.description ?? "").trim();
    let unitCost = 0;
    let productId: string | null = null;
    if (l.kind === "produit") {
      const p = l.productId ? pm.get(l.productId) : undefined;
      if (!p) throw new UserError("Produit introuvable.");
      productId = p.id;
      description = description || p.name;
      unitCost = p.purchasePrice;
    }
    if (!description) throw new UserError("Chaque ligne doit avoir une description.");
    return { kind: l.kind, productId, serviceId: l.kind === "service" ? (l.serviceId ?? null) : null, description, quantity: l.quantity, unitPrice: l.unitPrice, unitCost };
  });
}

export async function createQuote(
  tx: Tx, cx: Cx,
  o: { customerId: string; issueDate: string; validUntil: string | null; lines: DocLine[]; discount: number; notes: string | null; quoteId?: string },
) {
  const st = await getSettings(tx, cx.orgId);
  await assertCustomer(tx, cx.orgId, o.customerId);
  const lines = await resolveLines(tx, cx.orgId, o.lines);
  const t = computeTotals(lines, o.discount, st);
  let quote;
  if (o.quoteId) {
    const [ex] = await tx.select().from(s.quotes).where(and(eq(s.quotes.id, o.quoteId), eq(s.quotes.organizationId, cx.orgId))).for("update");
    if (!ex) throw new UserError("Devis introuvable.");
    if (ex.status === "converti") throw new UserError("Un devis converti en facture ne peut plus être modifié.");
    [quote] = await tx
      .update(s.quotes)
      .set({ customerId: o.customerId, issueDate: o.issueDate, validUntil: o.validUntil, notes: o.notes, ...t })
      .where(eq(s.quotes.id, ex.id))
      .returning();
    await tx.delete(s.quoteItems).where(eq(s.quoteItems.quoteId, ex.id));
  } else {
    const reference = await nextRef(tx, cx.orgId, "quote");
    [quote] = await tx
      .insert(s.quotes)
      .values({ organizationId: cx.orgId, reference, customerId: o.customerId, issueDate: o.issueDate, validUntil: o.validUntil, notes: o.notes, createdBy: cx.userId, ...t })
      .returning();
  }
  await tx.insert(s.quoteItems).values(
    lines.map((l) => ({ organizationId: cx.orgId, quoteId: quote.id, kind: l.kind, productId: l.productId, serviceId: l.serviceId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
  );
  await audit(tx, cx, o.quoteId ? "update" : "create", "quote", quote.id, { reference: quote.reference, total: t.total });
  return quote;
}

export async function createInvoice(
  tx: Tx, cx: Cx,
  o: { customerId: string; issueDate: string; dueDate: string | null; lines: DocLine[]; discount: number; notes: string | null; deductStock: boolean; quoteId?: string; serviceOrderId?: string },
) {
  const st = await getSettings(tx, cx.orgId);
  await assertCustomer(tx, cx.orgId, o.customerId);
  const lines = await resolveLines(tx, cx.orgId, o.lines);
  const t = computeTotals(lines, o.discount, st);
  const prodSub = lines.filter((l) => l.kind === "produit").reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const productRevenue = t.subtotal > 0 ? round2((t.total * prodSub) / t.subtotal) : 0;
  const reference = await nextRef(tx, cx.orgId, "invoice");
  if (o.deductStock)
    for (const l of lines)
      if (l.productId) await moveStock(tx, cx, { productId: l.productId, type: "vente", qty: -l.quantity, reference, reason: `Facture ${reference}`, allowNegative: st.allowNegativeStock });
  const [inv] = await tx
    .insert(s.invoices)
    .values({
      organizationId: cx.orgId, reference, customerId: o.customerId, issueDate: o.issueDate,
      dueDate: o.dueDate ?? addDays(o.issueDate, st.paymentTermsDays), ...t, productRevenue,
      serviceRevenue: round2(t.total - productRevenue), stockDeducted: o.deductStock && lines.some((l) => l.productId),
      quoteId: o.quoteId ?? null, serviceOrderId: o.serviceOrderId ?? null, notes: o.notes, createdBy: cx.userId,
      status: t.total === 0 ? "payee" : "emise",
    })
    .returning();
  await tx.insert(s.invoiceItems).values(
    lines.map((l) => ({ organizationId: cx.orgId, invoiceId: inv.id, kind: l.kind, productId: l.productId, serviceId: l.serviceId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, unitCost: l.unitCost })),
  );
  if (o.quoteId) await tx.update(s.quotes).set({ status: "converti", invoiceId: inv.id }).where(and(eq(s.quotes.id, o.quoteId), eq(s.quotes.organizationId, cx.orgId)));
  if (o.serviceOrderId) await tx.update(s.serviceOrders).set({ invoiceId: inv.id }).where(and(eq(s.serviceOrders.id, o.serviceOrderId), eq(s.serviceOrders.organizationId, cx.orgId)));
  await audit(tx, cx, "create", "invoice", inv.id, { reference, total: t.total });
  return inv;
}

export async function invoiceFromSale(tx: Tx, cx: Cx, saleId: string) {
  const st = await getSettings(tx, cx.orgId);
  const [sale] = await tx.select().from(s.sales).where(and(eq(s.sales.id, saleId), eq(s.sales.organizationId, cx.orgId))).for("update");
  if (!sale) throw new UserError("Vente introuvable.");
  if (sale.status !== "validee") throw new UserError("Vente annulée.");
  if (sale.invoiceId) throw new UserError("Cette vente est déjà facturée.");
  const items = await tx.select().from(s.saleItems).where(eq(s.saleItems.saleId, sale.id));
  const reference = await nextRef(tx, cx.orgId, "invoice");
  const issueDate = today(st.timezone);
  const [inv] = await tx
    .insert(s.invoices)
    .values({
      organizationId: cx.orgId, reference, customerId: sale.customerId, issueDate, dueDate: addDays(issueDate, st.paymentTermsDays),
      subtotal: sale.subtotal, discount: sale.discount, taxAmount: sale.taxAmount, total: sale.total, paid: sale.paid,
      productRevenue: sale.total, serviceRevenue: 0, saleId: sale.id, notes: sale.notes, createdBy: cx.userId,
      status: sale.paid >= sale.total - 0.005 ? "payee" : sale.paid > 0 ? "partielle" : "emise",
    })
    .returning();
  await tx.insert(s.invoiceItems).values(
    items.map((i) => ({ organizationId: cx.orgId, invoiceId: inv.id, kind: "produit", productId: i.productId, description: i.name, quantity: i.quantity, unitPrice: i.unitPrice, unitCost: i.unitCost })),
  );
  await tx.update(s.sales).set({ invoiceId: inv.id }).where(eq(s.sales.id, sale.id));
  await tx.update(s.payments).set({ invoiceId: inv.id }).where(and(eq(s.payments.saleId, sale.id), eq(s.payments.organizationId, cx.orgId)));
  await audit(tx, cx, "create", "invoice", inv.id, { reference, fromSale: sale.reference });
  return inv;
}

/** Annulation d'une facture : jamais de suppression, un avoir est émis et l'historique conservé. */
export async function cancelInvoice(tx: Tx, cx: Cx, invoiceId: string, reason: string, viaSale = false) {
  const st = await getSettings(tx, cx.orgId);
  const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.organizationId, cx.orgId))).for("update");
  if (!inv) throw new UserError("Facture introuvable.");
  if (inv.type !== "facture") throw new UserError("Seules les factures peuvent être annulées.");
  if (inv.status === "annulee") throw new UserError("Facture déjà annulée.");
  if (!reason.trim()) throw new UserError("Le motif d'annulation est obligatoire.");
  if (inv.saleId && !viaSale) throw new UserError("Cette facture provient d'une vente : annulez la vente associée.");
  if (inv.paid > 0 && !viaSale) await postPayment(tx, cx, { invoiceId: inv.id, amount: -inv.paid, method: "autre", label: "Remboursement", note: `Annulation ${inv.reference}` });
  if (inv.stockDeducted) {
    const items = await tx.select().from(s.invoiceItems).where(eq(s.invoiceItems.invoiceId, inv.id));
    for (const it of items)
      if (it.productId) await moveStock(tx, cx, { productId: it.productId, type: "retour", qty: it.quantity, reference: inv.reference, reason: `Annulation facture ${inv.reference}`, allowNegative: true });
  }
  await tx.update(s.invoices).set({ status: "annulee", cancelReason: reason }).where(eq(s.invoices.id, inv.id));
  if (inv.serviceOrderId) await tx.update(s.serviceOrders).set({ invoiceId: null }).where(eq(s.serviceOrders.id, inv.serviceOrderId));
  if (inv.quoteId) await tx.update(s.quotes).set({ status: "accepte", invoiceId: null }).where(eq(s.quotes.id, inv.quoteId));
  const creditRef = await nextRef(tx, cx.orgId, "credit");
  await tx.insert(s.invoices).values({
    organizationId: cx.orgId, reference: creditRef, type: "avoir", customerId: inv.customerId, status: "emise",
    issueDate: today(st.timezone), subtotal: inv.subtotal, discount: inv.discount, taxAmount: inv.taxAmount, total: inv.total,
    parentInvoiceId: inv.id, notes: `Avoir sur facture ${inv.reference} – ${reason}`, createdBy: cx.userId,
  });
  await audit(tx, cx, "cancel", "invoice", inv.id, { reason, credit: creditRef });
}

/* ───────── Prestations ───────── */
export async function invoiceFromOrder(tx: Tx, cx: Cx, orderId: string) {
  const st = await getSettings(tx, cx.orgId);
  const [o] = await tx.select().from(s.serviceOrders).where(and(eq(s.serviceOrders.id, orderId), eq(s.serviceOrders.organizationId, cx.orgId))).for("update");
  if (!o) throw new UserError("Prestation introuvable.");
  if (o.invoiceId) throw new UserError("Cette prestation est déjà facturée.");
  if (o.status === "annulee") throw new UserError("Prestation annulée.");
  const d = today(st.timezone);
  return createInvoice(tx, cx, {
    customerId: o.customerId, issueDate: d, dueDate: null, discount: 0, notes: `Prestation ${o.reference}`, deductStock: false, serviceOrderId: o.id,
    lines: [{ kind: "service", serviceId: o.serviceId, description: o.title, quantity: 1, unitPrice: o.price }],
  });
}

/* ───────── Achats fournisseurs ───────── */
export async function receivePurchaseOrder(tx: Tx, cx: Cx, id: string) {
  const [po] = await tx.select().from(s.purchaseOrders).where(and(eq(s.purchaseOrders.id, id), eq(s.purchaseOrders.organizationId, cx.orgId))).for("update");
  if (!po) throw new UserError("Commande introuvable.");
  if (po.status !== "commandee") throw new UserError("Cette commande ne peut pas être réceptionnée.");
  const items = await tx.select().from(s.purchaseOrderItems).where(eq(s.purchaseOrderItems.purchaseOrderId, po.id));
  for (const it of items) {
    await moveStock(tx, cx, { productId: it.productId, type: "entree", qty: it.quantity, reference: po.reference, reason: `Réception commande ${po.reference}`, allowNegative: true });
    await tx.update(s.products).set({ purchasePrice: it.unitCost }).where(eq(s.products.id, it.productId));
  }
  await tx.update(s.purchaseOrders).set({ status: "recue", receivedAt: new Date() }).where(eq(s.purchaseOrders.id, po.id));
  await notify(tx, cx.orgId, { perm: "suppliers.manage", type: "po_received", title: `Commande fournisseur reçue : ${po.reference}`, link: "/fournisseurs?tab=commandes" });
  await audit(tx, cx, "receive", "purchase_order", po.id, { reference: po.reference });
}

export async function payPurchaseOrder(tx: Tx, cx: Cx, id: string, amount: number, method: s.PayMethod) {
  const [po] = await tx.select().from(s.purchaseOrders).where(and(eq(s.purchaseOrders.id, id), eq(s.purchaseOrders.organizationId, cx.orgId))).for("update");
  if (!po) throw new UserError("Commande introuvable.");
  if (po.status === "annulee") throw new UserError("Commande annulée.");
  amount = round2(amount);
  if (!(amount > 0) || amount > po.total - po.paid + 0.005) throw new UserError("Montant invalide (supérieur au reste dû).");
  let [cat] = await tx.select().from(s.expenseCategories).where(and(eq(s.expenseCategories.organizationId, cx.orgId), eq(s.expenseCategories.name, "Achat de marchandises")));
  if (!cat) [cat] = await tx.insert(s.expenseCategories).values({ organizationId: cx.orgId, name: "Achat de marchandises" }).returning();
  const st = await getSettings(tx, cx.orgId);
  await tx.insert(s.expenses).values({
    organizationId: cx.orgId, categoryId: cat.id, supplierId: po.supplierId, purchaseOrderId: po.id,
    label: `Règlement commande ${po.reference}`, amount, date: today(st.timezone), method, createdBy: cx.userId,
  });
  await tx.update(s.purchaseOrders).set({ paid: round2(po.paid + amount) }).where(eq(s.purchaseOrders.id, po.id));
  await audit(tx, cx, "payment", "purchase_order", po.id, { amount });
}

/* ───────── Alertes automatiques (stock, échéances, retards) ───────── */
const lastSync = new Map<string, number>();
export async function syncAlerts(orgId: string, tz: string, force = false) {
  if (!force && Date.now() - (lastSync.get(orgId) ?? 0) < 60_000) return;
  lastSync.set(orgId, Date.now());
  const t = today(tz);
  const low = await db
    .select()
    .from(s.products)
    .where(and(eq(s.products.organizationId, orgId), eq(s.products.active, true), sql`${s.products.quantity} <= ${s.products.alertThreshold}`))
    .limit(50);
  for (const p of low)
    await notify(db, orgId, {
      perm: "stock.manage", type: p.quantity <= 0 ? "stock_out" : "stock_low",
      title: p.quantity <= 0 ? `Produit épuisé : ${p.name}` : `Stock faible : ${p.name}`,
      body: `Quantité restante : ${p.quantity} (seuil ${p.alertThreshold})`, link: "/stocks", dedupeKey: `stock:${p.id}:${p.quantity}`,
    });
  const overdue = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.organizationId, orgId), eq(s.invoices.type, "facture"), inArray(s.invoices.status, ["emise", "partielle"]), sql`${s.invoices.dueDate} < ${t}::date`))
    .limit(50);
  for (const i of overdue)
    await notify(db, orgId, {
      perm: "invoices.manage", type: "invoice_overdue", title: `Échéance dépassée : ${i.reference}`,
      body: `Reste à payer : ${round2(num(i.total) - num(i.paid))}`, link: `/factures/${i.id}`, dedupeKey: `inv-overdue:${i.id}`,
    });
  const late = await db
    .select()
    .from(s.serviceOrders)
    .where(and(eq(s.serviceOrders.organizationId, orgId), inArray(s.serviceOrders.status, ["en_attente", "acceptee", "en_cours", "en_pause"]), sql`${s.serviceOrders.dueDate} < ${t}::date`))
    .limit(50);
  for (const o of late)
    await notify(db, orgId, {
      perm: "orders.manage", userIds: [o.assigneeId], type: "order_late", title: `Prestation en retard : ${o.reference}`,
      body: o.title, link: `/prestations/${o.id}`, dedupeKey: `order-late:${o.id}`,
    });
}
