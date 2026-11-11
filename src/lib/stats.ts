import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { addDays, fmtMoney, num, type Cur, type Range } from "@/lib/format";

type R = Record<string, unknown>;
export const rows = async (q: SQL): Promise<R[]> => (await db.execute(q)).rows as R[];

/**
 * Définition du chiffre d'affaires (CA) : ventes validées + factures émises non annulées
 * (hors factures issues d'une vente, déjà comptées) + prestations terminées non facturées.
 * Colonnes : kind (vente|prestation), day, amt.
 */
export function revenueUnion(org: string, from: string, to: string, tz: string) {
  return sql`
    select 'vente'::text kind, (s.created_at at time zone ${tz})::date as day, s.total::numeric amt
      from sales s where s.organization_id=${org} and s.status='validee'
       and (s.created_at at time zone ${tz})::date between ${from}::date and ${to}::date
    union all
    select 'vente', i.issue_date, i.product_revenue::numeric from invoices i
      where i.organization_id=${org} and i.type='facture' and i.status<>'annulee' and i.sale_id is null
       and i.issue_date between ${from}::date and ${to}::date
    union all
    select 'prestation', i.issue_date, i.service_revenue::numeric from invoices i
      where i.organization_id=${org} and i.type='facture' and i.status<>'annulee' and i.sale_id is null
       and i.issue_date between ${from}::date and ${to}::date
    union all
    select 'prestation', (o.completed_at at time zone ${tz})::date, o.price::numeric from service_orders o
      where o.organization_id=${org} and o.status in ('terminee','livree') and o.invoice_id is null
       and (o.completed_at at time zone ${tz})::date between ${from}::date and ${to}::date`;
}

function buckets(from: string, to: string) {
  const days = (Date.parse(to) - Date.parse(from)) / 864e5;
  const monthly = days > 62;
  const keys: { k: string; label: string }[] = [];
  if (!monthly) {
    for (let d = from; d <= to; d = addDays(d, 1)) keys.push({ k: d, label: `${d.slice(8)}/${d.slice(5, 7)}` });
  } else {
    let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
    const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      const mm = String(m).padStart(2, "0");
      keys.push({ k: `${y}-${mm}`, label: `${mm}/${y}` });
      if (++m > 12) { m = 1; y++; }
    }
  }
  return { monthly, keys };
}

export async function getSeries(org: string, range: Range, tz: string) {
  const { monthly, keys } = buckets(range.from, range.to);
  const fmt = monthly ? "YYYY-MM" : "YYYY-MM-DD";
  const rev = await rows(sql`select to_char(day, ${fmt}::text) k, kind, sum(amt) v from (${revenueUnion(org, range.from, range.to, tz)}) t group by 1,2`);
  const exp = await rows(sql`select to_char(date, ${fmt}::text) k, sum(amount) v from expenses where organization_id=${org} and date between ${range.from}::date and ${range.to}::date group by 1`);
  return keys.map(({ k, label }) => {
    const ventes = num(rev.find((r) => r.k === k && r.kind === "vente")?.v);
    const prestations = num(rev.find((r) => r.k === k && r.kind === "prestation")?.v);
    const depenses = num(exp.find((r) => r.k === k)?.v);
    return { k, label, ventes, prestations, ca: ventes + prestations, depenses, resultat: ventes + prestations - depenses };
  });
}

export async function receivables(org: string) {
  const [r] = await rows(sql`
    select
     (select coalesce(sum(total-paid),0) from sales where organization_id=${org} and status='validee' and invoice_id is null and total>paid)
     + (select coalesce(sum(total-paid),0) from invoices where organization_id=${org} and type='facture' and status in ('emise','partielle')) as v`);
  return num(r?.v);
}

export async function getDashboard(org: string, range: Range, tz: string) {
  const { from, to } = range;
  const [rev, series, [pay], [exp], [counts], top, perSeller, byMethod, [orders], unpaid] = await Promise.all([
    rows(sql`select kind, sum(amt) v from (${revenueUnion(org, from, to, tz)}) t group by kind`),
    getSeries(org, range, tz),
    rows(sql`select coalesce(sum(amount),0) v from payments where organization_id=${org} and (paid_at at time zone ${tz})::date between ${from}::date and ${to}::date`),
    rows(sql`select coalesce(sum(amount),0) v from expenses where organization_id=${org} and date between ${from}::date and ${to}::date`),
    rows(sql`select
      (select count(*) from customers where organization_id=${org} and archived=false)::int customers,
      (select count(*) from products where organization_id=${org} and active=true)::int products,
      (select count(*) from products where organization_id=${org} and active=true and quantity<=alert_threshold)::int low`),
    rows(sql`select name, sum(q)::int qty from (
        select si.name, si.quantity q from sale_items si join sales s on s.id=si.sale_id
          where s.organization_id=${org} and s.status='validee' and (s.created_at at time zone ${tz})::date between ${from}::date and ${to}::date
        union all
        select ii.description, ii.quantity from invoice_items ii join invoices i on i.id=ii.invoice_id
          where i.organization_id=${org} and ii.kind='produit' and i.type='facture' and i.status<>'annulee' and i.sale_id is null
          and i.issue_date between ${from}::date and ${to}::date) t group by name order by qty desc limit 6`),
    rows(sql`select coalesce(p.full_name,'—') name, count(*)::int n, sum(s.total) total from sales s left join profiles p on p.id=s.created_by
      where s.organization_id=${org} and s.status='validee' and (s.created_at at time zone ${tz})::date between ${from}::date and ${to}::date group by 1 order by total desc limit 8`),
    rows(sql`select method, sum(amount) v from payments where organization_id=${org} and (paid_at at time zone ${tz})::date between ${from}::date and ${to}::date group by 1 order by v desc`),
    rows(sql`select
      count(*) filter (where status in ('acceptee','en_cours','en_pause'))::int running,
      count(*) filter (where status='en_attente')::int waiting,
      count(*) filter (where status in ('terminee','livree') and (completed_at at time zone ${tz})::date between ${from}::date and ${to}::date)::int done
      from service_orders where organization_id=${org}`),
    receivables(org),
  ]);
  const ventes = num(rev.find((r) => r.kind === "vente")?.v);
  const prestations = num(rev.find((r) => r.kind === "prestation")?.v);
  const depenses = num(exp?.v);
  return {
    ca: ventes + prestations, ventes, prestations, depenses,
    benefice: ventes + prestations - depenses,
    encaisse: num(pay?.v), impayes: unpaid,
    customers: num(counts?.customers), products: num(counts?.products), low: num(counts?.low),
    running: num(orders?.running), waiting: num(orders?.waiting), done: num(orders?.done),
    series,
    top: top.map((r) => ({ name: String(r.name), qty: num(r.qty) })),
    perSeller: perSeller.map((r) => ({ name: String(r.name), n: num(r.n), total: num(r.total) })),
    byMethod: byMethod.map((r) => ({ method: String(r.method), v: num(r.v) })),
  };
}

export async function getFinance(org: string, range: Range, tz: string) {
  const [[p], [e], [allP], [allE]] = await Promise.all([
    rows(sql`select coalesce(sum(amount),0) v from payments where organization_id=${org} and (paid_at at time zone ${tz})::date between ${range.from}::date and ${range.to}::date`),
    rows(sql`select coalesce(sum(amount),0) v from expenses where organization_id=${org} and date between ${range.from}::date and ${range.to}::date`),
    rows(sql`select coalesce(sum(amount),0) v from payments where organization_id=${org}`),
    rows(sql`select coalesce(sum(amount),0) v from expenses where organization_id=${org}`),
  ]);
  const rev = await rows(sql`select coalesce(sum(amt),0) v from (${revenueUnion(org, range.from, range.to, tz)}) t`);
  const ca = num(rev[0]?.v);
  return {
    ca, encaisse: num(p?.v), depenses: num(e?.v), resultat: ca - num(e?.v),
    tresorerie: num(allP?.v) - num(allE?.v), creances: await receivables(org),
  };
}

export type Report = { title: string; columns: string[]; rows: (string | number)[][]; summary: { label: string; value: string }[] };
export const REPORTS = [
  { key: "ventes", label: "Ventes" },
  { key: "prestations", label: "Prestations" },
  { key: "stocks", label: "Stocks" },
  { key: "depenses", label: "Dépenses" },
  { key: "benefices", label: "Bénéfices estimés" },
  { key: "creances", label: "Créances" },
  { key: "employes", label: "Performance employés" },
] as const;

const STATUS_FR: Record<string, string> = {
  en_attente: "En attente", acceptee: "Acceptée", en_cours: "En cours", en_pause: "En pause", terminee: "Terminée", livree: "Livrée", annulee: "Annulée",
  validee: "Validée", payee: "Payée", partielle: "Partiellement payée", impayee: "Non payée", emise: "Émise",
};
const D = (col: string) => `to_char(${col},'DD/MM/YYYY')`;

export async function getReport(org: string, type: string, range: Range, tz: string, cur: Cur): Promise<Report> {
  const { from, to } = range;
  const M = (n: unknown) => fmtMoney(num(n), cur);
  const sum = (rs: R[], k: string) => rs.reduce((a, r) => a + num(r[k]), 0);
  if (type === "ventes") {
    const rs = await rows(sql`select s.reference, to_char(s.created_at at time zone ${tz},'DD/MM/YYYY') d, coalesce(c.name,'Client comptoir') client,
        s.total, s.paid, s.status, coalesce(p.full_name,'—') seller
      from sales s left join customers c on c.id=s.customer_id left join profiles p on p.id=s.created_by
      where s.organization_id=${org} and (s.created_at at time zone ${tz})::date between ${from}::date and ${to}::date order by s.created_at desc`);
    const ok = rs.filter((r) => r.status === "validee");
    return {
      title: "Rapport des ventes", columns: ["Référence", "Date", "Client", "Total", "Payé", "Reste", "État", "Vendeur"],
      rows: rs.map((r) => [String(r.reference), String(r.d), String(r.client), M(r.total), M(r.paid), M(num(r.total) - num(r.paid)),
        r.status === "annulee" ? "Annulée" : num(r.paid) >= num(r.total) ? "Payée" : num(r.paid) > 0 ? "Partielle" : "Non payée", String(r.seller)]),
      summary: [{ label: "Ventes validées", value: String(ok.length) }, { label: "Total vendu", value: M(sum(ok, "total")) }, { label: "Encaissé", value: M(sum(ok, "paid")) }, { label: "Reste à encaisser", value: M(sum(ok, "total") - sum(ok, "paid")) }],
    };
  }
  if (type === "prestations") {
    const rs = await rows(sql`select o.reference, ${sql.raw(D("o.created_at"))} d, c.name client, o.title, o.status, coalesce(p.full_name,'—') who, o.price,
        coalesce((select sum(quantity*unit_cost) from service_order_items x where x.order_id=o.id),0) cost
      from service_orders o join customers c on c.id=o.customer_id left join profiles p on p.id=o.assignee_id
      where o.organization_id=${org} and (o.created_at at time zone ${tz})::date between ${from}::date and ${to}::date order by o.created_at desc`);
    const ok = rs.filter((r) => r.status !== "annulee");
    return {
      title: "Rapport des prestations", columns: ["Référence", "Date", "Client", "Prestation", "Statut", "Responsable", "Prix", "Coûts", "Marge"],
      rows: rs.map((r) => [String(r.reference), String(r.d), String(r.client), String(r.title), STATUS_FR[String(r.status)] ?? String(r.status), String(r.who), M(r.price), M(r.cost), M(num(r.price) - num(r.cost))]),
      summary: [{ label: "Prestations", value: String(ok.length) }, { label: "Montant", value: M(sum(ok, "price")) }, { label: "Coûts", value: M(sum(ok, "cost")) }, { label: "Marge", value: M(sum(ok, "price") - sum(ok, "cost")) }],
    };
  }
  if (type === "stocks") {
    const rs = await rows(sql`select p.sku, p.name, coalesce(c.name,'—') cat, p.quantity, p.alert_threshold th, p.purchase_price pp, p.sale_price sp
      from products p left join categories c on c.id=p.category_id where p.organization_id=${org} and p.active=true order by p.name`);
    const vAch = rs.reduce((a, r) => a + num(r.quantity) * num(r.pp), 0);
    const vVen = rs.reduce((a, r) => a + num(r.quantity) * num(r.sp), 0);
    return {
      title: "Rapport des stocks (état actuel)", columns: ["SKU", "Produit", "Catégorie", "Quantité", "Seuil", "Valeur d'achat", "Valeur de vente", "État"],
      rows: rs.map((r) => [String(r.sku), String(r.name), String(r.cat), num(r.quantity), num(r.th), M(num(r.quantity) * num(r.pp)), M(num(r.quantity) * num(r.sp)), num(r.quantity) <= 0 ? "Épuisé" : num(r.quantity) <= num(r.th) ? "Stock faible" : "OK"]),
      summary: [{ label: "Références", value: String(rs.length) }, { label: "Valeur d'achat", value: M(vAch) }, { label: "Valeur de vente", value: M(vVen) }, { label: "Alertes", value: String(rs.filter((r) => num(r.quantity) <= num(r.th)).length) }],
    };
  }
  if (type === "depenses") {
    const rs = await rows(sql`select ${sql.raw(D("e.date"))} d, coalesce(c.name,'—') cat, e.label, coalesce(s.name,'—') sup, e.amount, e.method
      from expenses e left join expense_categories c on c.id=e.category_id left join suppliers s on s.id=e.supplier_id
      where e.organization_id=${org} and e.date between ${from}::date and ${to}::date order by e.date desc`);
    return {
      title: "Rapport des dépenses", columns: ["Date", "Catégorie", "Libellé", "Fournisseur", "Montant", "Mode"],
      rows: rs.map((r) => [String(r.d), String(r.cat), String(r.label), String(r.sup), M(r.amount), String(r.method)]),
      summary: [{ label: "Dépenses", value: String(rs.length) }, { label: "Total", value: M(sum(rs, "amount")) }],
    };
  }
  if (type === "benefices") {
    const series = await getSeries(org, range, tz);
    const t = (k: "ventes" | "prestations" | "ca" | "depenses" | "resultat") => series.reduce((a, r) => a + r[k], 0);
    return {
      title: "Rapport des bénéfices estimés", columns: ["Période", "Ventes", "Prestations", "Chiffre d'affaires", "Dépenses", "Résultat estimé"],
      rows: series.map((r) => [r.label, M(r.ventes), M(r.prestations), M(r.ca), M(r.depenses), M(r.resultat)]),
      summary: [{ label: "Chiffre d'affaires", value: M(t("ca")) }, { label: "Dépenses", value: M(t("depenses")) }, { label: "Résultat estimé", value: M(t("resultat")) }],
    };
  }
  if (type === "creances") {
    const rs = await rows(sql`select * from (
        select 'Facture' t, i.reference, coalesce(c.name,'—') client, ${sql.raw(D("i.issue_date"))} d, ${sql.raw(D("i.due_date"))} due, i.total, i.paid,
          greatest(0,(current_date - i.due_date))::int late from invoices i left join customers c on c.id=i.customer_id
          where i.organization_id=${org} and i.type='facture' and i.status in ('emise','partielle')
        union all
        select 'Vente', s.reference, coalesce(c.name,'Client comptoir'), ${sql.raw(D("s.created_at::date"))}, '—', s.total, s.paid, 0 from sales s left join customers c on c.id=s.customer_id
          where s.organization_id=${org} and s.status='validee' and s.invoice_id is null and s.total>s.paid) x order by late desc`);
    const tot = rs.reduce((a, r) => a + num(r.total) - num(r.paid), 0);
    return {
      title: "Rapport des créances clients", columns: ["Type", "Référence", "Client", "Date", "Échéance", "Total", "Payé", "Reste dû", "Retard (j)"],
      rows: rs.map((r) => [String(r.t), String(r.reference), String(r.client), String(r.d), String(r.due), M(r.total), M(r.paid), M(num(r.total) - num(r.paid)), num(r.late)]),
      summary: [{ label: "Documents impayés", value: String(rs.length) }, { label: "Total des créances", value: M(tot) }],
    };
  }
  if (type === "employes") {
    const rs = await rows(sql`select p.full_name, m.role,
        (select count(*) from service_orders o where o.organization_id=${org} and o.assignee_id=p.id and (o.created_at at time zone ${tz})::date between ${from}::date and ${to}::date)::int assigned,
        (select count(*) from service_orders o where o.organization_id=${org} and o.assignee_id=p.id and o.status in ('terminee','livree') and (o.completed_at at time zone ${tz})::date between ${from}::date and ${to}::date)::int done,
        (select count(*) from sales s where s.organization_id=${org} and s.created_by=p.id and s.status='validee' and (s.created_at at time zone ${tz})::date between ${from}::date and ${to}::date)::int nsales,
        (select coalesce(sum(total),0) from sales s where s.organization_id=${org} and s.created_by=p.id and s.status='validee' and (s.created_at at time zone ${tz})::date between ${from}::date and ${to}::date) vsales
      from organization_members m join profiles p on p.id=m.user_id where m.organization_id=${org} order by p.full_name`);
    return {
      title: "Performance des employés", columns: ["Employé", "Rôle", "Prestations attribuées", "Prestations terminées", "Ventes", "Montant des ventes"],
      rows: rs.map((r) => [String(r.full_name), String(r.role), num(r.assigned), num(r.done), num(r.nsales), M(r.vsales)]),
      summary: [{ label: "Employés", value: String(rs.length) }, { label: "Prestations terminées", value: String(rs.reduce((a, r) => a + num(r.done), 0)) }, { label: "Montant des ventes", value: M(sum(rs, "vsales")) }],
    };
  }
  throw new Error("Type de rapport inconnu");
}
