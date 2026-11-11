import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Pencil, Plus } from "lucide-react";
import { db } from "@/db";
import { customers, organizationMembers, profiles, serviceOrders, services } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { ActionButton, Filters, FormDialog, type Field } from "@/components/client";
import { Badge, Card, Empty, PAGE_SIZE, PageHeader, Pager, StatusBadge, Tabs, likeOf, pageOf } from "@/components/ui";
import { saveOrderAction } from "@/app/actions/ops";
import { saveServiceAction, toggleServiceAction } from "@/app/actions/crm";

export const metadata = { title: "Prestations" };
const STATUS_OPTIONS = [["en_attente", "En attente"], ["acceptee", "Acceptée"], ["en_cours", "En cours"], ["en_pause", "En pause"], ["terminee", "Terminée"], ["livree", "Livrée"], ["annulee", "Annulée"]].map(([value, label]) => ({ value, label }));

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string; assignee?: string; page?: string }> }) {
  const ctx = await pageCtx("orders.view");
  const sp = await searchParams;
  const org = ctx.org.id;
  const manage = can(ctx.role, "orders.manage");
  const tab = sp.tab === "catalogue" ? "catalogue" : "ordres";
  const page = pageOf(sp.page);
  const M = (n: number) => fmtMoney(n, ctx.settings);
  const tabs = manage ? [{ key: "ordres", label: "Ordres de prestation" }, { key: "catalogue", label: "Catalogue de services" }] : [{ key: "ordres", label: "Mes prestations" }];

  const svcFields = (v?: typeof services.$inferSelect): Field[] => [
    { name: "name", label: "Nom du service", required: true, defaultValue: v?.name, full: true },
    { name: "price", label: `Tarif (${ctx.settings.currencyLabel})`, type: "number", min: "0", required: true, defaultValue: v?.price ?? 0 },
    { name: "durationMinutes", label: "Durée estimée (minutes)", type: "number", step: "1", min: "0", defaultValue: v?.durationMinutes },
    { name: "description", label: "Description", type: "textarea", defaultValue: v?.description },
    ...(v ? [{ name: "active", label: "Service actif", type: "checkbox" as const, defaultValue: v.active }] : []),
  ];

  if (tab === "catalogue" && manage) {
    const list = await db.select().from(services).where(eq(services.organizationId, org)).orderBy(asc(services.name));
    return (
      <>
        <PageHeader title="Prestations" subtitle="Catalogue de services et ordres d'intervention">
          {can(ctx.role, "catalog.manage") && <FormDialog title="Nouveau service" trigger={<><Plus className="h-4 w-4" /> Nouveau service</>} fields={svcFields()} action={saveServiceAction} />}
        </PageHeader>
        <Tabs current={tab} items={tabs} />
        <Card>
          {list.length === 0 ? <Empty text="Aucun service au catalogue." /> : (
            <table className="tbl"><thead><tr><th>Service</th><th>Description</th><th className="text-right">Tarif</th><th>Durée</th><th>Statut</th><th /></tr></thead><tbody>
              {list.map((v) => (
                <tr key={v.id}><td className="font-medium">{v.name}</td><td className="max-w-xs truncate">{v.description ?? "—"}</td><td className="text-right">{M(v.price)}</td><td>{v.durationMinutes ? `${v.durationMinutes} min` : "—"}</td>
                  <td>{v.active ? <Badge tone="green">Actif</Badge> : <Badge>Inactif</Badge>}</td>
                  <td><div className="flex justify-end gap-2">
                    {can(ctx.role, "catalog.manage") && <FormDialog title="Modifier le service" triggerClass="btn-outline btn-sm" trigger={<Pencil className="h-3.5 w-3.5" />} fields={svcFields(v)} hidden={{ id: v.id, hasActive: "1" }} action={saveServiceAction} />}
                    {can(ctx.role, "catalog.manage") && <ActionButton action={toggleServiceAction} hidden={{ id: v.id, active: v.active ? "0" : "1" }} label={v.active ? "Désactiver" : "Activer"} />}
                  </div></td></tr>
              ))}</tbody></table>
          )}
        </Card>
      </>
    );
  }

  const where = and(
    eq(serviceOrders.organizationId, org),
    manage ? undefined : eq(serviceOrders.assigneeId, ctx.user.id),
    sp.status ? eq(serviceOrders.status, sp.status) : undefined,
    sp.assignee === "me" ? eq(serviceOrders.assigneeId, ctx.user.id) : undefined,
    sp.q ? or(ilike(serviceOrders.reference, likeOf(sp.q)), ilike(serviceOrders.title, likeOf(sp.q)), ilike(customers.name, likeOf(sp.q))) : undefined,
  );
  const [rows, [{ n }], custs, svcs, members] = await Promise.all([
    db.select({ o: serviceOrders, cname: customers.name, who: profiles.fullName }).from(serviceOrders).innerJoin(customers, eq(customers.id, serviceOrders.customerId)).leftJoin(profiles, eq(profiles.id, serviceOrders.assigneeId))
      .where(where).orderBy(desc(serviceOrders.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(serviceOrders).innerJoin(customers, eq(customers.id, serviceOrders.customerId)).where(where),
    manage ? db.select({ id: customers.id, name: customers.name }).from(customers).where(and(eq(customers.organizationId, org), eq(customers.archived, false))).orderBy(asc(customers.name)) : Promise.resolve([]),
    manage ? db.select().from(services).where(and(eq(services.organizationId, org), eq(services.active, true))).orderBy(asc(services.name)) : Promise.resolve([]),
    manage ? db.select({ id: profiles.id, name: profiles.fullName }).from(organizationMembers).innerJoin(profiles, eq(profiles.id, organizationMembers.userId)).where(and(eq(organizationMembers.organizationId, org), eq(organizationMembers.active, true))).orderBy(asc(profiles.fullName)) : Promise.resolve([]),
  ]);
  const t = today(ctx.settings.timezone);
  return (
    <>
      <PageHeader title="Prestations" subtitle="Catalogue de services et ordres d'intervention">
        {manage && (
          <FormDialog title="Nouvelle prestation" trigger={<><Plus className="h-4 w-4" /> Nouvelle prestation</>}
            description="Une référence est générée automatiquement."
            fields={[
              { name: "customerId", label: "Client", type: "select", required: true, options: custs.map((c) => ({ value: c.id, label: c.name })), full: true },
              { name: "serviceId", label: "Service demandé", type: "select", options: svcs.map((v) => ({ value: v.id, label: `${v.name} — ${M(v.price)}` })), hint: "Le tarif du catalogue est repris si le prix est laissé vide." },
              { name: "title", label: "Intitulé", hint: "Par défaut : nom du service." },
              { name: "description", label: "Description du problème / besoin", type: "textarea" },
              { name: "price", label: `Prix convenu (${ctx.settings.currencyLabel})`, type: "number", min: "0" },
              { name: "assigneeId", label: "Employé responsable", type: "select", options: members.map((m) => ({ value: m.id, label: m.name })) },
              { name: "dueDate", label: "Date prévue", type: "date" },
              { name: "internalNotes", label: "Notes internes", type: "textarea" },
            ]}
            action={saveOrderAction} />
        )}
      </PageHeader>
      <Tabs current={tab} items={tabs} />
      <Card>
        <div className="border-b border-slate-100 p-3">
          <Filters placeholder="Référence, client, intitulé…" selects={[{ name: "status", label: "Tous les statuts", options: STATUS_OPTIONS }, ...(manage ? [{ name: "assignee", label: "Tous les employés", options: [{ value: "me", label: "Mes prestations" }] }] : [])]} />
        </div>
        {rows.length === 0 ? <Empty text="Aucune prestation." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Référence</th><th>Client</th><th>Intitulé</th><th>Responsable</th><th>Prévue le</th><th className="text-right">Prix</th><th>Progression</th><th>Statut</th></tr></thead><tbody>
            {rows.map(({ o, cname, who }) => {
              const late = o.dueDate && o.dueDate < t && !["terminee", "livree", "annulee"].includes(o.status);
              return (
                <tr key={o.id}><td><Link href={`/prestations/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link></td><td>{cname}</td><td className="max-w-[220px] truncate">{o.title}</td><td>{who ?? "—"}</td>
                  <td className="whitespace-nowrap">{fmtDate(o.dueDate)} {late && <Badge tone="red">Retard</Badge>}</td><td className="text-right">{M(o.price)}</td>
                  <td><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${o.progress}%` }} /></div></td><td><StatusBadge status={o.status} /></td></tr>
              );
            })}</tbody></table></div>
        )}
        <Pager page={page} total={n} params={sp} />
      </Card>
    </>
  );
}
