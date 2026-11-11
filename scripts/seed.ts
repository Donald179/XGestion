/**
 * Données de démonstration (environnement de test uniquement).
 *   npx tsx scripts/seed.ts
 * Crée 2 entreprises totalement isolées + comptes de test, en passant par les mêmes
 * fonctions métier transactionnelles que l'application (stock, paiements, factures…).
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import * as biz from "../src/lib/biz";
import { hashPassword } from "../src/lib/core";

const PASSWORD = "Demo1234!";

async function user(email: string, fullName: string) {
  const [ex] = await db.select().from(s.profiles).where(eq(s.profiles.email, email));
  if (ex) return ex;
  const [u] = await db.insert(s.profiles).values({ email, fullName, passwordHash: hashPassword(PASSWORD) }).returning();
  return u;
}

async function main() {
  const [exists] = await db.select().from(s.profiles).where(eq(s.profiles.email, "demo@gestionpro.test"));
  if (exists) {
    console.log("Données de démonstration déjà présentes.");
    return;
  }
  const owner = await user("demo@gestionpro.test", "Awa Ouédraogo");
  const manager = await user("gestionnaire@gestionpro.test", "Issa Traoré");
  const cashier = await user("caissier@gestionpro.test", "Fatou Sawadogo");
  const tech = await user("technicien@gestionpro.test", "Moussa Kaboré");
  const other = await user("autre@gestionpro.test", "Jean Dupont (autre entreprise)");

  const org = await db.transaction((tx) => biz.createOrganization(tx, owner.id, { name: "Faso Info Services", email: "contact@fasoinfo.test", phone: "+226 70 00 00 00", address: "Ouagadougou, Burkina Faso" }));
  await db.insert(s.organizationMembers).values([
    { organizationId: org.id, userId: manager.id, role: "gestionnaire" },
    { organizationId: org.id, userId: cashier.id, role: "caissier" },
    { organizationId: org.id, userId: tech.id, role: "technicien" },
  ]);
  const cx: biz.Cx = { orgId: org.id, userId: owner.id, role: "proprietaire" };
  const cashierCx: biz.Cx = { orgId: org.id, userId: cashier.id, role: "caissier" };

  const [catPc, catAcc] = await db.insert(s.categories).values([{ organizationId: org.id, name: "Ordinateurs" }, { organizationId: org.id, name: "Accessoires" }]).returning();
  const [sup] = await db.insert(s.suppliers).values({ organizationId: org.id, name: "Sahel Distribution", contact: "M. Compaoré", phone: "+226 71 11 11 11" }).returning();
  const customers = await db.insert(s.customers).values([
    { organizationId: org.id, name: "Boulangerie Le Pain d'Or", type: "entreprise", phone: "+226 70 12 34 56" },
    { organizationId: org.id, name: "Rasmané Zongo", phone: "+226 76 98 76 54" },
    { organizationId: org.id, name: "Clinique Wend Panga", type: "entreprise", email: "admin@wendpanga.test" },
  ]).returning();
  const prods = await db.insert(s.products).values([
    { organizationId: org.id, name: "Laptop HP 15 pouces", sku: "PC-HP15", categoryId: catPc.id, supplierId: sup.id, purchasePrice: 280000, salePrice: 345000, alertThreshold: 2 },
    { organizationId: org.id, name: "Souris sans fil", sku: "ACC-MOUSE", categoryId: catAcc.id, supplierId: sup.id, purchasePrice: 3500, salePrice: 6000, alertThreshold: 5 },
    { organizationId: org.id, name: "Clavier USB", sku: "ACC-KEYB", categoryId: catAcc.id, purchasePrice: 5000, salePrice: 9000, alertThreshold: 5 },
    { organizationId: org.id, name: "Câble réseau RJ45 (10 m)", sku: "ACC-RJ45", categoryId: catAcc.id, purchasePrice: 1500, salePrice: 3000, alertThreshold: 10 },
  ]).returning();
  const initial = [8, 25, 12, 6];
  await db.transaction(async (tx) => {
    for (let i = 0; i < prods.length; i++) await biz.moveStock(tx, cx, { productId: prods[i].id, type: "entree", qty: initial[i], reason: "Stock initial", allowNegative: false });
  });
  const [svcMaint, svcInstall] = await db.insert(s.services).values([
    { organizationId: org.id, name: "Maintenance informatique", description: "Diagnostic, nettoyage, mise à jour", price: 15000, durationMinutes: 90 },
    { organizationId: org.id, name: "Installation réseau", description: "Câblage et configuration Wi-Fi", price: 60000, durationMinutes: 240 },
  ]).returning();

  // Ventes
  await db.transaction((tx) => biz.createSale(tx, cashierCx, { customerId: customers[1].id, lines: [{ productId: prods[1].id, quantity: 2 }, { productId: prods[2].id, quantity: 1 }], discount: 0, method: "mobile_money", paid: 21000, notes: null }));
  await db.transaction((tx) => biz.createSale(tx, cx, { customerId: customers[0].id, lines: [{ productId: prods[0].id, quantity: 2 }], discount: 10000, method: "virement", paid: 300000, notes: "Acompte 300 000" }));
  await db.transaction((tx) => biz.createSale(tx, cashierCx, { customerId: null, lines: [{ productId: prods[3].id, quantity: 3 }], discount: 0, method: "especes", paid: 9000, notes: null }));
  // Prestations
  await db.transaction(async (tx) => {
    const ref = await biz.nextRef(tx, org.id, "order");
    const [o] = await tx.insert(s.serviceOrders).values({ organizationId: org.id, reference: ref, customerId: customers[2].id, serviceId: svcInstall.id, title: "Installation Wi-Fi clinique", description: "Étage 1 et 2", price: 60000, assigneeId: tech.id, status: "en_cours", progress: 40, createdBy: owner.id, dueDate: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) }).returning();
    await tx.insert(s.serviceOrderItems).values({ organizationId: org.id, orderId: o.id, label: "Bobine de câble", quantity: 1, unitCost: 12000 });
    const ref2 = await biz.nextRef(tx, org.id, "order");
    const [o2] = await tx.insert(s.serviceOrders).values({ organizationId: org.id, reference: ref2, customerId: customers[0].id, serviceId: svcMaint.id, title: "Maintenance du parc (5 PC)", price: 75000, assigneeId: tech.id, status: "terminee", progress: 100, completedAt: new Date(), createdBy: owner.id }).returning();
    await biz.audit(tx, cx, "create", "service_order", o.id, { reference: ref });
    await biz.audit(tx, cx, "create", "service_order", o2.id, { reference: ref2 });
  });
  // Facture mixte produit + prestation
  const inv = await db.transaction((tx) => biz.createInvoice(tx, cx, {
    customerId: customers[2].id, issueDate: new Date().toISOString().slice(0, 10), dueDate: null, discount: 0, notes: "Facture mixte", deductStock: true,
    lines: [{ kind: "produit", productId: prods[3].id, description: "", quantity: 2, unitPrice: 3000 }, { kind: "service", serviceId: svcMaint.id, description: "Maintenance informatique", quantity: 1, unitPrice: 15000 }],
  }));
  await db.transaction((tx) => biz.postPayment(tx, cx, { invoiceId: inv.id, amount: 10000, method: "especes" }));
  // Devis
  await db.transaction((tx) => biz.createQuote(tx, cx, { customerId: customers[0].id, issueDate: new Date().toISOString().slice(0, 10), validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), discount: 0, notes: null,
    lines: [{ kind: "produit", productId: prods[0].id, description: "", quantity: 1, unitPrice: 345000 }, { kind: "service", serviceId: svcInstall.id, description: "Installation réseau", quantity: 1, unitPrice: 60000 }] }));
  // Dépenses
  const cats = await db.select().from(s.expenseCategories).where(eq(s.expenseCategories.organizationId, org.id));
  const cat = (n: string) => cats.find((c) => c.name === n)?.id ?? null;
  await db.insert(s.expenses).values([
    { organizationId: org.id, categoryId: cat("Loyer"), label: "Loyer du local", amount: 75000, date: new Date().toISOString().slice(0, 10), method: "virement", createdBy: owner.id },
    { organizationId: org.id, categoryId: cat("Internet"), label: "Abonnement fibre", amount: 25000, date: new Date().toISOString().slice(0, 10), method: "mobile_money", createdBy: owner.id },
    { organizationId: org.id, categoryId: cat("Transport"), label: "Déplacements clients", amount: 8000, date: new Date().toISOString().slice(0, 10), createdBy: owner.id },
  ]);
  // Commande d'achat reçue (réapprovisionnement)
  const po = await db.transaction(async (tx) => {
    const ref = await biz.nextRef(tx, org.id, "purchase");
    const [p] = await tx.insert(s.purchaseOrders).values({ organizationId: org.id, reference: ref, supplierId: sup.id, orderDate: new Date().toISOString().slice(0, 10), total: 100000, createdBy: owner.id }).returning();
    await tx.insert(s.purchaseOrderItems).values({ organizationId: org.id, purchaseOrderId: p.id, productId: prods[1].id, quantity: 20, unitCost: 3500 }, );
    await tx.insert(s.purchaseOrderItems).values({ organizationId: org.id, purchaseOrderId: p.id, productId: prods[2].id, quantity: 6, unitCost: 5000 });
    return p;
  });
  await db.transaction((tx) => biz.receivePurchaseOrder(tx, cx, po.id));
  // Étaler les ventes dans le temps pour des graphiques lisibles
  await db.execute(sql`update sales set created_at = created_at - (random()*20 || ' days')::interval where organization_id = ${org.id}`);
  await biz.syncAlerts(org.id, "Africa/Ouagadougou", true);

  // 2e entreprise (test d'isolation)
  const org2 = await db.transaction((tx) => biz.createOrganization(tx, other.id, { name: "Boutique Autre Entreprise" }));
  await db.insert(s.customers).values({ organizationId: org2.id, name: "Client confidentiel de l'autre entreprise" });
  console.log("Démonstration créée. Comptes (mot de passe : " + PASSWORD + ") :");
  console.log(" - demo@gestionpro.test (propriétaire) | gestionnaire@… | caissier@… | technicien@… (@gestionpro.test)");
  console.log(" - autre@gestionpro.test (propriétaire d'une AUTRE entreprise)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
