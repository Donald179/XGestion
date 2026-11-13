import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" }).notNull().default(0);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export type Role = "proprietaire" | "administrateur" | "gestionnaire" | "caissier" | "technicien";
export type PayMethod = "especes" | "mobile_money" | "virement" | "carte" | "autre";

/* ───────── Identité & multi-tenant ───────── */
export const profiles = pgTable("profiles", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const passwordResets = pgTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  taxId: text("tax_id"),
  logoUrl: text("logo_url"),
  createdAt: createdAt(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("om_org_user").on(t.organizationId, t.userId), index("om_user").on(t.userId)],
);

export const organizationSettings = pgTable("organization_settings", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("XOF"),
  currencyLabel: text("currency_label").notNull().default("FCFA"),
  locale: text("locale").notNull().default("fr-FR"),
  timezone: text("timezone").notNull().default("Africa/Ouagadougou"),
  taxEnabled: boolean("tax_enabled").notNull().default(false),
  taxName: text("tax_name").notNull().default("TVA"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(18),
  invoicePrefix: text("invoice_prefix").notNull().default("FAC"),
  quotePrefix: text("quote_prefix").notNull().default("DEV"),
  salePrefix: text("sale_prefix").notNull().default("VTE"),
  orderPrefix: text("order_prefix").notNull().default("PRS"),
  purchasePrefix: text("purchase_prefix").notNull().default("CMD"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  quoteValidityDays: integer("quote_validity_days").notNull().default(30),
  allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
  invoiceFooter: text("invoice_footer"),
  invoiceSeq: integer("invoice_seq").notNull().default(0),
  creditSeq: integer("credit_seq").notNull().default(0),
  quoteSeq: integer("quote_seq").notNull().default(0),
  saleSeq: integer("sale_seq").notNull().default(0),
  orderSeq: integer("order_seq").notNull().default(0),
  purchaseSeq: integer("purchase_seq").notNull().default(0),
  receiptSeq: integer("receipt_seq").notNull().default(0),
});

/* ───────── Tiers ───────── */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    type: text("type").notNull().default("particulier"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("cust_org").on(t.organizationId)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    contact: text("contact"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("sup_org").on(t.organizationId)],
);

/* ───────── Catalogue & stock ───────── */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [index("cat_org").on(t.organizationId)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    description: text("description"),
    purchasePrice: money("purchase_price"),
    salePrice: money("sale_price"),
    quantity: integer("quantity").notNull().default(0),
    alertThreshold: integer("alert_threshold").notNull().default(5),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("prod_sku").on(t.organizationId, t.sku), index("prod_org").on(t.organizationId)],
);

export const stockLocations = pgTable(
  "stock_locations",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [index("loc_org").on(t.organizationId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    organizationId: orgId(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => stockLocations.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason"),
    reference: text("reference"),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("sm_org_prod").on(t.organizationId, t.productId), index("sm_org_date").on(t.organizationId, t.createdAt)],
);

/* ───────── Prestations ───────── */
export const services = pgTable(
  "services",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    price: money("price"),
    durationMinutes: integer("duration_minutes"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("svc_org").on(t.organizationId)],
);

export const serviceOrders = pgTable(
  "service_orders",
  {
    id: id(),
    organizationId: orgId(),
    reference: text("reference").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    price: money("price"),
    assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
    status: text("status").notNull().default("en_attente"),
    progress: integer("progress").notNull().default(0),
    dueDate: date("due_date"),
    internalNotes: text("internal_notes"),
    invoiceId: uuid("invoice_id"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("so_ref").on(t.organizationId, t.reference), index("so_org").on(t.organizationId, t.status)],
);

export const serviceOrderItems = pgTable(
  "service_order_items",
  {
    id: id(),
    organizationId: orgId(),
    orderId: uuid("order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitCost: money("unit_cost"),
    createdAt: createdAt(),
  },
  (t) => [index("soi_order").on(t.orderId)],
);

/* ───────── Ventes ───────── */
export const sales = pgTable(
  "sales",
  {
    id: id(),
    organizationId: orgId(),
    reference: text("reference").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("validee"),
    subtotal: money("subtotal"),
    discount: money("discount"),
    taxAmount: money("tax_amount"),
    total: money("total"),
    paid: money("paid"),
    invoiceId: uuid("invoice_id"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sale_ref").on(t.organizationId, t.reference), index("sale_org_date").on(t.organizationId, t.createdAt)],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    organizationId: orgId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price"),
    unitCost: money("unit_cost"),
  },
  (t) => [index("si_sale").on(t.saleId)],
);

/* ───────── Devis & factures ───────── */
export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    organizationId: orgId(),
    reference: text("reference").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    status: text("status").notNull().default("brouillon"),
    issueDate: date("issue_date").notNull(),
    validUntil: date("valid_until"),
    subtotal: money("subtotal"),
    discount: money("discount"),
    taxAmount: money("tax_amount"),
    total: money("total"),
    notes: text("notes"),
    invoiceId: uuid("invoice_id"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quote_ref").on(t.organizationId, t.reference)],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: id(),
    organizationId: orgId(),
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("libre"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price"),
  },
  (t) => [index("qi_quote").on(t.quoteId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    organizationId: orgId(),
    reference: text("reference").notNull(),
    type: text("type").notNull().default("facture"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("emise"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    subtotal: money("subtotal"),
    discount: money("discount"),
    taxAmount: money("tax_amount"),
    total: money("total"),
    paid: money("paid"),
    productRevenue: money("product_revenue"),
    serviceRevenue: money("service_revenue"),
    stockDeducted: boolean("stock_deducted").notNull().default(false),
    saleId: uuid("sale_id"),
    serviceOrderId: uuid("service_order_id"),
    quoteId: uuid("quote_id"),
    parentInvoiceId: uuid("parent_invoice_id"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inv_ref").on(t.organizationId, t.reference), index("inv_org_date").on(t.organizationId, t.issueDate)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    organizationId: orgId(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("libre"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price"),
    unitCost: money("unit_cost"),
  },
  (t) => [index("ii_inv").on(t.invoiceId)],
);

/* ───────── Paiements & finances ───────── */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    organizationId: orgId(),
    reference: text("reference").notNull(),
    kind: text("kind").notNull().default("vente"),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    method: text("method").$type<PayMethod>().notNull().default("especes"),
    label: text("label"),
    note: text("note"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("pay_ref").on(t.organizationId, t.reference), index("pay_org_date").on(t.organizationId, t.paidAt)],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
  },
  (t) => [index("ec_org").on(t.organizationId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    organizationId: orgId(),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    purchaseOrderId: uuid("purchase_order_id"),
    label: text("label").notNull(),
    amount: money("amount"),
    date: date("date").notNull(),
    method: text("method").$type<PayMethod>().notNull().default("especes"),
    receiptUrl: text("receipt_url"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("exp_org_date").on(t.organizationId, t.date)],
);

/* ───────── Achats fournisseurs ───────── */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    organizationId: orgId(),
    reference: text("reference").notNull(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    status: text("status").notNull().default("commandee"),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    total: money("total"),
    paid: money("paid"),
    supplierInvoiceRef: text("supplier_invoice_ref"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("po_ref").on(t.organizationId, t.reference)],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: id(),
    organizationId: orgId(),
    purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitCost: money("unit_cost"),
  },
  (t) => [index("poi_po").on(t.purchaseOrderId)],
);

/* ───────── Notifications & audit ───────── */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    read: boolean("read").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user").on(t.userId, t.organizationId, t.read), uniqueIndex("notif_dedupe").on(t.userId, t.organizationId, t.dedupeKey)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_entity").on(t.organizationId, t.entity, t.entityId)],
);

/* ───────── Licences SaaS ───────── */
export const licenses = pgTable("licenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  licenseKey: text("license_key").notNull().unique(),
  planType: text("plan_type").notNull().default("mensuel"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  maxUsers: integer("max_users").notNull().default(3),
  isActive: boolean("is_active").notNull().default(true),
  activatedAt: timestamp("activated_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
