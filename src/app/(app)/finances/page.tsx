import Link from "next/link";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Banknote, CircleDollarSign, Landmark, PiggyBank, Plus, Receipt, Settings2, TrendingDown, Pencil, Trash2 } from "lucide-react";
import { db } from "@/db";
import { customers, expenseCategories, expenses, invoices, payments, sales, suppliers } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFinance } from "@/lib/stats";
import { METHOD_LABELS, PERIODS, fmtDate, fmtDateTime, fmtMoney, resolveRange, today } from "@/lib/format";
import { ActionButton, FormDialog, PeriodPicker, type Field } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, StatCard, Tabs, pageOf } from "@/components/ui";
import { deleteExpenseAction, otherIncomeAction, saveExpenseAction, saveExpenseCategoryAction } from "@/app/actions/ops";

export const metadata = { title: "Finances" };
const methodOpts = Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));

export default async function FinancesPage({ searchParams }: { searchParams: Promise<{ tab?: string; p?: string; from?: string; to?: string; page?: string }> }) {
  const ctx = await pageCtx("finance.view");
  const sp = await searchParams;
  const org = ctx.org.id;
  const tz = ctx.settings.timezone;
  const range = resolveRange(sp, tz);
  const manage = can(ctx.role, "expenses.manage");
  const tab = ["recettes", "creances"].includes(sp.tab ?? "") ? sp.tab! : "depenses";
  const page = pageOf(sp.page);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const f = await getFinance(org, range, tz);
  const [cats, sups, custs] = await Promise.all([
    db.select().from(expenseCategories).where(eq(expenseCategories.organizationId, org)).orderBy(asc(expenseCategories.name)),
    db.select().from(suppliers).where(eq(suppliers.organizationId, org)).orderBy(asc(suppliers.name)),
    db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.organizationId, org)).orderBy(asc(customers.name)),
  ]);
  const expFields = (e?: typeof expenses.$inferSelect): Field[] => [
    { name: "label", label: "Libellé", required: true, defaultValue: e?.label, full: true },
    { name: "amount", label: `Montant (${ctx.settings.currencyLabel})`, type: "number", min: "0", required: true, defaultValue: e?.amount },
    { name: "date", label: "Date", type: "date", required: true, defaultValue: e?.date ?? today(tz) },
    { name: "categoryId", label: "Catégorie", type: "select", defaultValue: e?.categoryId, options: cats.map((c) => ({ value: c.id, label: c.name })) },
    { name: "supplierId", label: "Fournisseur", type: "select", defaultValue: e?.supplierId, options: sups.map((c) => ({ value: c.id, label: c.name })) },
    { name: "method", label: "Mode de paiement", type: "select", required: true, defaultValue: e?.method ?? "especes", options: methodOpts },
    { name: "receiptUrl", label: "Pièce justificative (image/PDF < 600 Ko)", type: "file", defaultValue: e?.receiptUrl, full: true },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: e?.notes },
  ];
  const tabs = [{ key: "depenses", label: "Dépenses" }, { key: "recettes", label: "Recettes & paiements" }, { key: "creances", label: "Créances clients" }];
  const keep = { p: sp.p, from: sp.from, to: sp.to };

  return (
    <>
      <PageHeader title="Finances" subtitle="Chiffre d'affaires ≠ encaissements ≠ bénéfice ≠ trésorerie : chaque indicateur est calculé séparément.">
        <PeriodPicker periods={PERIODS} current={range.period} from={range.from} to={range.to} />
        {manage && <FormDialog title="Nouvelle dépense" trigger={<><Plus className="h-4 w-4" /> Dépense</>} fields={expFields()} action={saveExpenseAction} />}
        {manage && <FormDialog title="Catégorie de dépense" triggerClass="btn-outline" trigger={<><Settings2 className="h-4 w-4" /> Catégories</>} description={`Existantes : ${cats.map((c) => c.name).join(", ")}`} fields={[{ name: "name", label: "Nouvelle catégorie", required: true, full: true }]} action={saveExpenseCategoryAction} />}
      </PageHeader>
      <p className="mb-2 text-xs text-slate-500">Période : du {fmtDate(range.from)} au {fmtDate(range.to)} (la trésorerie et les créances sont cumulées à ce jour).</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Chiffre d'affaires" value={M(f.ca)} icon={<Receipt className="h-5 w-5" />} hint="Facturé / vendu" />
        <StatCard label="Recettes encaissées" value={M(f.encaisse)} icon={<Banknote className="h-5 w-5" />} tone="green" />
        <StatCard label="Dépenses enregistrées" value={M(f.depenses)} icon={<TrendingDown className="h-5 w-5" />} tone="red" />
        <StatCard label="Résultat estimé" value={M(f.resultat)} icon={<PiggyBank className="h-5 w-5" />} tone={f.resultat >= 0 ? "green" : "red"} hint="CA − dépenses" />
        <StatCard label="Trésorerie enregistrée" value={M(f.tresorerie)} icon={<Landmark className="h-5 w-5" />} tone={f.tresorerie >= 0 ? "blue" : "red"} hint="Encaissé − décaissé (cumul)" />
      </div>
      <div className="mb-5"><StatCard label="Créances clients (reste dû)" value={M(f.creances)} icon={<CircleDollarSign className="h-5 w-5" />} tone="orange" /></div>
      <Tabs current={tab} items={tabs} params={keep} />

      {tab === "depenses" && await (async () => {
        const where = and(eq(expenses.organizationId, org), gte(expenses.date, range.from), lte(expenses.date, range.to));
        const [rows, [{ n }]] = await Promise.all([
          db.select({ e: expenses, cat: expenseCategories.name, sup: suppliers.name }).from(expenses).leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId)).leftJoin(suppliers, eq(suppliers.id, expenses.supplierId)).where(where).orderBy(desc(expenses.date), desc(expenses.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
          db.select({ n: sql<number>`count(*)::int` }).from(expenses).where(where),
        ]);
        return (
          <Card>
            {rows.length === 0 ? <Empty text="Aucune dépense sur la période." /> : (
              <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Fournisseur</th><th>Mode</th><th className="text-right">Montant</th><th>Pièce</th><th /></tr></thead><tbody>
                {rows.map(({ e, cat, sup }) => (
                  <tr key={e.id}><td>{fmtDate(e.date)}</td><td className="font-medium">{e.label}</td><td>{cat ?? "—"}</td><td>{sup ?? "—"}</td><td>{METHOD_LABELS[e.method]}</td><td className="text-right font-medium text-red-600">{M(e.amount)}</td>
                    <td>{e.receiptUrl ? <a href={e.receiptUrl} download={`justificatif-${e.id}`} className="text-brand-700 underline">Voir</a> : "—"}</td>
                    <td><div className="flex justify-end gap-2">
                      {manage && !e.purchaseOrderId && <FormDialog title="Modifier la dépense" triggerClass="btn-outline btn-sm" trigger={<Pencil className="h-3.5 w-3.5" />} fields={expFields(e)} hidden={{ id: e.id }} action={saveExpenseAction} />}
                      {manage && !e.purchaseOrderId && <ActionButton action={deleteExpenseAction} hidden={{ id: e.id }} confirm="Supprimer cette dépense ? L'action sera journalisée." label={<Trash2 className="h-3.5 w-3.5" />} className="btn-outline btn-sm text-red-600" />}
                    </div></td></tr>
                ))}</tbody></table></div>
            )}
            <Pager page={page} total={n} params={{ ...sp, tab: undefined }} />
          </Card>
        );
      })()}

      {tab === "recettes" && await (async () => {
        const where = and(eq(payments.organizationId, org), sql`(${payments.paidAt} at time zone ${tz})::date between ${range.from}::date and ${range.to}::date`);
        const [rows, [{ n }]] = await Promise.all([
          db.select({ p: payments, cname: customers.name, inv: invoices.reference, sale: sales.reference }).from(payments).leftJoin(customers, eq(customers.id, payments.customerId)).leftJoin(invoices, eq(invoices.id, payments.invoiceId)).leftJoin(sales, eq(sales.id, payments.saleId)).where(where).orderBy(desc(payments.paidAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
          db.select({ n: sql<number>`count(*)::int` }).from(payments).where(where),
        ]);
        return (
          <Card title="Paiements et recettes" actions={manage ? <FormDialog title="Autre recette" triggerClass="btn-outline btn-sm" trigger={<><Plus className="h-3.5 w-3.5" /> Autre revenu</>}
            fields={[{ name: "label", label: "Libellé", required: true, full: true }, { name: "amount", label: "Montant", type: "number", min: "0", required: true }, { name: "method", label: "Mode", type: "select", required: true, defaultValue: "especes", options: methodOpts }, { name: "customerId", label: "Client (facultatif)", type: "select", options: custs.map((c) => ({ value: c.id, label: c.name })) }, { name: "note", label: "Note", full: true }]} action={otherIncomeAction} /> : undefined}>
            {rows.length === 0 ? <Empty text="Aucun paiement sur la période." /> : (
              <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Reçu</th><th>Date</th><th>Origine</th><th>Client</th><th>Mode</th><th className="text-right">Montant</th></tr></thead><tbody>
                {rows.map(({ p, cname, inv, sale }) => (
                  <tr key={p.id}><td><Link className="text-brand-700 hover:underline" href={`/recu/${p.id}`}>{p.reference}</Link></td><td className="whitespace-nowrap">{fmtDateTime(p.paidAt, tz)}</td>
                    <td>{inv ? `Facture ${inv}` : sale ? `Vente ${sale}` : <Badge tone="blue">{p.label ?? "Autre revenu"}</Badge>}{p.amount < 0 && <> <Badge tone="red">Remboursement</Badge></>}</td>
                    <td>{cname ?? "—"}</td><td>{METHOD_LABELS[p.method]}</td><td className={`text-right font-medium ${p.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{M(p.amount)}</td></tr>
                ))}</tbody></table></div>
            )}
            <Pager page={page} total={n} params={{ ...sp, tab: "recettes" }} />
          </Card>
        );
      })()}

      {tab === "creances" && await (async () => {
        const [inv, sl] = await Promise.all([
          db.select({ i: invoices, cname: customers.name }).from(invoices).leftJoin(customers, eq(customers.id, invoices.customerId)).where(and(eq(invoices.organizationId, org), eq(invoices.type, "facture"), sql`${invoices.status} in ('emise','partielle')`)).orderBy(asc(invoices.dueDate)).limit(100),
          db.select({ s: sales, cname: customers.name }).from(sales).leftJoin(customers, eq(customers.id, sales.customerId)).where(and(eq(sales.organizationId, org), eq(sales.status, "validee"), sql`${sales.invoiceId} is null`, sql`${sales.total} > ${sales.paid}`)).orderBy(desc(sales.createdAt)).limit(100),
        ]);
        const items = [
          ...inv.map(({ i, cname }) => ({ id: i.id, href: `/factures/${i.id}`, ref: i.reference, kind: "Facture", client: cname ?? "—", due: i.dueDate, total: i.total, paid: i.paid })),
          ...sl.map(({ s, cname }) => ({ id: s.id, href: `/ventes/${s.id}`, ref: s.reference, kind: "Vente", client: cname ?? "Comptoir", due: null as string | null, total: s.total, paid: s.paid })),
        ];
        return (
          <Card title="Créances clients">
            {items.length === 0 ? <Empty text="Aucune créance : tout est réglé." /> : (
              <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Document</th><th>Type</th><th>Client</th><th>Échéance</th><th className="text-right">Total</th><th className="text-right">Payé</th><th className="text-right">Reste dû</th></tr></thead><tbody>
                {items.map((x) => <tr key={x.id}><td><Link className="font-medium text-brand-700 hover:underline" href={x.href}>{x.ref}</Link></td><td>{x.kind}</td><td>{x.client}</td><td>{fmtDate(x.due)}</td><td className="text-right">{M(x.total)}</td><td className="text-right text-emerald-600">{M(x.paid)}</td><td className="text-right font-semibold text-red-600">{M(x.total - x.paid)}</td></tr>)}
              </tbody></table></div>
            )}
          </Card>
        );
      })()}
    </>
  );
}
